import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

interface ThreadRow {
  id: string;
  customer_id: string;
  worker_id: string;
  last_message_at: string;
  customer: { full_name: string; avatar_url: string | null } | null;
  worker: { full_name: string; avatar_url: string | null } | null;
  messages: { body: string; created_at: string; sender_id: string; read_at: string | null }[];
}

/** Messages inbox (design 08) — threads sorted by activity. */
export default function MessagesScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('threads')
      .select(
        `id, customer_id, worker_id, last_message_at,
         customer:profiles!threads_customer_id_fkey(full_name, avatar_url),
         worker:profiles!threads_worker_id_fkey(full_name, avatar_url),
         messages(body, created_at, sender_id, read_at)`,
      )
      .order('last_message_at', { ascending: false })
      .order('created_at', { referencedTable: 'messages', ascending: false })
      .limit(1, { referencedTable: 'messages' });
    setThreads((data as unknown as ThreadRow[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen padded={false}>
      {threads === null ? (
        <LoadingState />
      ) : threads.length === 0 ? (
        <EmptyState
          title="No messages yet"
          message="Chats with pros and customers will show up here."
        />
      ) : (
        <View>
          {threads.map((thread) => {
            const other =
              thread.customer_id === session?.user.id ? thread.worker : thread.customer;
            const last = thread.messages[0];
            const unread =
              last && last.sender_id !== session?.user.id && last.read_at === null;
            return (
              <Pressable
                key={thread.id}
                accessibilityRole="button"
                onPress={() => router.push(`/thread/${thread.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.s3,
                  padding: space.s4,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Avatar name={other?.full_name ?? '?'} uri={other?.avatar_url} showStatusDot />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="label">{other?.full_name ?? 'Unknown'}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {last ? timeAgo(last.created_at) : timeAgo(thread.last_message_at)}
                    </AppText>
                  </View>
                  <AppText
                    variant="bodySm"
                    color={unread ? 'text' : 'textMuted'}
                    numberOfLines={1}
                  >
                    {last?.body ?? 'Say hello 👋'}
                  </AppText>
                </View>
                {unread && (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.accent,
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
