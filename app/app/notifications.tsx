import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/badges';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, Skeleton, lightTap } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { AppNotification } from '@/types/db';

const ICONS: Record<AppNotification['type'], keyof typeof Ionicons.glyphMap> = {
  job_request: 'briefcase',
  job_status: 'calendar',
  new_message: 'chatbubble-ellipses',
  new_review: 'star',
  formalization_suggestion: 'ribbon',
  verification_result: 'shield-checkmark',
  system: 'information-circle',
};

/**
 * Which notifications are asking something of you.
 *
 * A finished job produces a notification for the other side, which is correct
 * — but those pile up and bury the two kinds that actually need a person: a
 * new request, and a new message. Splitting the list is the difference between
 * an inbox and a log.
 */
const ACTIONABLE: AppNotification['type'][] = [
  'job_request',
  'new_message',
  'formalization_suggestion',
  'verification_result',
];

/** Icon tint per type, so a completed job does not look like a new request. */
type Tone = 'accent' | 'success' | 'warning';
const TONES: Record<AppNotification['type'], Tone> = {
  job_request: 'warning',
  job_status: 'accent',
  new_message: 'accent',
  new_review: 'success',
  formalization_suggestion: 'success',
  verification_result: 'success',
  system: 'accent',
};

type Filter = 'all' | 'needs' | 'updates';

/** Where a notification takes you when tapped. */
function destinationFor(item: AppNotification): string | null {
  const jobId = typeof item.data?.job_id === 'string' ? item.data.job_id : null;
  switch (item.type) {
    case 'job_request':
    case 'job_status':
      return jobId ? `/job/${jobId}` : '/(tabs)/bookings';
    case 'new_message':
      return '/(tabs)/messages';
    case 'new_review':
      return '/(tabs)/profile';
    case 'formalization_suggestion':
      return '/formalize';
    case 'verification_result':
      return '/verification';
    default:
      return null;
  }
}

/** Notification centre behind the header bell. */
export default function NotificationsScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!session) return;
    // Unread only: a notification centre is a queue, not an archive. Once you
    // have opened something it has done its job.
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as AppNotification[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /*
    Opening a notification consumes it.

    Marking it "read" but leaving it in place meant the list only ever grew —
    you dealt with something and it still sat there looking like it needed
    you. It disappears now, which is what tapping it means. Nothing is lost:
    the thing it points AT (the booking, the message) is still there.
  */
  const open = async (item: AppNotification) => {
    setItems((current) => current?.filter((row) => row.id !== item.id) ?? null);
    if (!item.read_at) {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id);
    }
    const destination = destinationFor(item);
    if (destination) router.push(destination as never);
  };

  const markAllRead = async () => {
    if (!session) return;
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('read_at', null);
    void load();
  };

  if (items === null) {
    return (
      <Screen>
        <View style={{ gap: space.s3 }}>
          <Skeleton height={74} radius={radius.lg} />
          <Skeleton height={74} radius={radius.lg} />
          <Skeleton height={74} radius={radius.lg} />
        </View>
      </Screen>
    );
  }

  const needsCount = items.filter(
    (item) => ACTIONABLE.includes(item.type) && !item.read_at,
  ).length;

  const visible =
    filter === 'all'
      ? items
      : filter === 'needs'
        ? items.filter((item) => ACTIONABLE.includes(item.type))
        : items.filter((item) => !ACTIONABLE.includes(item.type));

  return (
    <Screen>
      <View style={{ gap: space.s4 }}>
        {items.length === 0 ? (
          <EmptyState
            title="All caught up"
            message="Booking updates, new messages and reviews land here. Opening one clears it."
          />
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <AppText variant="bodySm" color="textMuted">
                {items.length === 1 ? '1 notification' : `${items.length} notifications`}
              </AppText>
              {items.length > 0 && (
                <Pressable accessibilityRole="button" onPress={() => void markAllRead()} hitSlop={8}>
                  <AppText variant="bodySm" color="accent">
                    Clear all
                  </AppText>
                </Pressable>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' }}>
              <Chip
                label={`All (${items.length})`}
                selected={filter === 'all'}
                onPress={() => {
                  lightTap();
                  setFilter('all');
                }}
              />
              <Chip
                label={`Needs you${needsCount > 0 ? ` (${needsCount})` : ''}`}
                selected={filter === 'needs'}
                onPress={() => {
                  lightTap();
                  setFilter('needs');
                }}
              />
              <Chip
                label="Job updates"
                selected={filter === 'updates'}
                onPress={() => {
                  lightTap();
                  setFilter('updates');
                }}
              />
            </View>

            {visible.length === 0 && (
              <AppText variant="bodySm" color="textMuted" style={{ textAlign: 'center' }}>
                {filter === 'needs'
                  ? 'Nothing is waiting on you.'
                  : 'No job updates yet.'}
              </AppText>
            )}

            {visible.map((item, index) => (
              <FadeSlideIn key={item.id} delay={Math.min(index, 8) * 50}>
                <Card raised={!item.read_at} onPress={() => void open(item)}>
                  <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'flex-start' }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: radius.md,
                        backgroundColor: item.read_at
                          ? colors.surfaceRaised
                          : tintSoft(colors, TONES[item.type]),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={ICONS[item.type] ?? 'notifications'}
                        size={18}
                        color={item.read_at ? colors.textMuted : tint(colors, TONES[item.type])}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" numberOfLines={1}>
                        {item.title}
                      </AppText>
                      {item.body ? (
                        <AppText variant="bodySm" color="textMuted" numberOfLines={2}>
                          {item.body}
                        </AppText>
                      ) : null}
                      <AppText variant="caption" color="textMuted">
                        {timeAgo(item.created_at)}
                      </AppText>
                    </View>
                    {!item.read_at && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.accent,
                          marginTop: space.s2,
                        }}
                      />
                    )}
                  </View>
                </Card>
              </FadeSlideIn>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

function tint(colors: { accent: string; success: string; warning: string }, tone: Tone): string {
  return tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.accent;
}

function tintSoft(
  colors: { accentSoft: string; successSoft: string; warningSoft: string },
  tone: Tone,
): string {
  return tone === 'success'
    ? colors.successSoft
    : tone === 'warning'
      ? colors.warningSoft
      : colors.accentSoft;
}
