import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { Avatar } from './ui/Avatar';
import { Badge } from './ui/badges';
import { Card } from './ui/Card';
import { Rating } from './ui/Rating';
import { AppText } from './ui/Text';
import { formatRate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { MatchedWorker } from '@/types/db';

interface WorkerCardProps {
  worker: MatchedWorker;
  onPress: () => void;
}

/**
 * The pro card from the design system.
 *
 * Every row is capped to a single line and the card has a fixed height, so a
 * long name or an extra badge can never make one card taller than the next —
 * the list stays on a uniform rhythm however the data varies.
 */
// 4 single-line rows (28 + 20 + 20 + 16) + 3 gaps (12) + card padding (32).
const CARD_HEIGHT = 128;

export function WorkerCard({ worker, onPress }: WorkerCardProps) {
  const { colors } = useTheme();

  return (
    <Card onPress={onPress} style={{ height: CARD_HEIGHT, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
        <Avatar name={worker.full_name} uri={worker.avatar_url} size="lg" />

        <View style={{ flex: 1, minWidth: 0, gap: space.s1 }}>
          {/* Name + trust badges (icon-only so they never wrap) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <AppText variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {worker.full_name}
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.s1, flexShrink: 0 }}>
              {worker.tier_skill && <Badge kind="topPro" compact />}
              {worker.identity_verified && <Badge kind="verified" compact />}
            </View>
          </View>

          {/* Rating + volume */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Rating value={Number(worker.rating_avg)} />
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              · {worker.jobs_completed} job{worker.jobs_completed === 1 ? '' : 's'}
            </AppText>
          </View>

          {/* What they do */}
          <AppText variant="bodySm" color="textMuted" numberOfLines={1}>
            {worker.service_title || worker.headline}
          </AppText>

          {/* Rate + where */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <AppText variant="label" color="accent" numberOfLines={1} style={{ flexShrink: 0 }}>
              {formatRate(worker.rate_min_jmd, worker.rate_max_jmd, worker.rate_unit)}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {worker.distance_km != null ? `${worker.distance_km} km · ` : ''}
              {worker.parish}
            </AppText>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}
