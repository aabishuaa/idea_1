import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, Skeleton } from '@/components/ui/animated';
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

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as AppNotification[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = async (item: AppNotification) => {
    if (!item.read_at) {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id);
      setItems(
        (current) =>
          current?.map((row) =>
            row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
          ) ?? null,
      );
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

  const unreadCount = items.filter((item) => !item.read_at).length;

  return (
    <Screen>
      <View style={{ gap: space.s4 }}>
        {items.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            message="Booking updates, new messages and reviews will appear here."
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
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </AppText>
              {unreadCount > 0 && (
                <Pressable accessibilityRole="button" onPress={() => void markAllRead()} hitSlop={8}>
                  <AppText variant="bodySm" color="accent">
                    Mark all read
                  </AppText>
                </Pressable>
              )}
            </View>

            {items.map((item, index) => (
              <FadeSlideIn key={item.id} delay={Math.min(index, 8) * 50}>
                <Card raised={!item.read_at} onPress={() => void open(item)}>
                  <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'flex-start' }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: radius.md,
                        backgroundColor: item.read_at ? colors.surfaceRaised : colors.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={ICONS[item.type] ?? 'notifications'}
                        size={18}
                        color={item.read_at ? colors.textMuted : colors.accent}
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
