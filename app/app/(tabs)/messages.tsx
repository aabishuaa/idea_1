import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Chip } from '@/components/ui/badges';
import { FadeSlideIn, Skeleton, lightTap } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface ThreadRow {
  id: string;
  customer_id: string;
  worker_id: string;
  last_message_at: string;
  customer: { full_name: string; avatar_url: string | null } | null;
  worker: { full_name: string; avatar_url: string | null } | null;
  messages: {
    body: string;
    created_at: string;
    sender_id: string;
    read_at: string | null;
    kind?: 'text' | 'image' | 'job_card';
  }[];
}

type Filter = 'all' | 'unread';

/**
 * Messages inbox (design 08).
 *
 * Rebuilt because the list was a wall of identical grey rows: nothing showed
 * what actually needed a reply, there was no way to search it, and a photo or
 * a shared booking looked exactly like a sentence. Now unread leads and is
 * countable, search filters by name, and each row says what the last message
 * actually was.
 */
export default function MessagesScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('threads')
      .select(
        `id, customer_id, worker_id, last_message_at,
         customer:profiles!threads_customer_id_fkey(full_name, avatar_url),
         worker:profiles!threads_worker_id_fkey(full_name, avatar_url),
         messages(body, created_at, sender_id, read_at, kind)`,
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

  const decorated = useMemo(
    () =>
      (threads ?? []).map((thread) => {
        const other = thread.customer_id === session?.user.id ? thread.worker : thread.customer;
        const last = thread.messages[0];
        const unread = Boolean(
          last && last.sender_id !== session?.user.id && last.read_at === null,
        );
        const mine = Boolean(last && last.sender_id === session?.user.id);
        return { thread, other, last, unread, mine };
      }),
    [threads, session],
  );

  const unreadCount = decorated.filter((row) => row.unread).length;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return decorated
      .filter((row) => (filter === 'unread' ? row.unread : true))
      .filter((row) => (term ? (row.other?.full_name ?? '').toLowerCase().includes(term) : true))
      // Anything waiting on a reply floats to the top.
      .sort((a, b) => Number(b.unread) - Number(a.unread));
  }, [decorated, filter, query]);

  return (
    <Screen safeTop padded={false}>
      <View style={{ paddingHorizontal: space.s4, gap: space.s3, paddingBottom: space.s3 }}>
        {/* This moved from a stack screen (which supplied a header) into a
            tab, so it needs its own app bar and title. */}
        <AppHeader />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <AppText variant="h2" style={{ flex: 1 }}>
            Messages
          </AppText>
          {unreadCount > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s1,
                paddingHorizontal: space.s3,
                paddingVertical: space.s1,
                borderRadius: radius.full,
                backgroundColor: colors.accentSoft,
              }}
            >
              <View
                style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }}
              />
              <AppText variant="caption" color="accent">
                {unreadCount} unread
              </AppText>
            </View>
          )}
        </View>

        {(threads?.length ?? 0) > 3 && (
          <Input
            icon="search"
            placeholder="Search by name…"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        )}

        {unreadCount > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              <Chip
                label={`All (${decorated.length})`}
                selected={filter === 'all'}
                onPress={() => {
                  lightTap();
                  setFilter('all');
                }}
              />
              <Chip
                label={`Needs a reply (${unreadCount})`}
                selected={filter === 'unread'}
                onPress={() => {
                  lightTap();
                  setFilter('unread');
                }}
              />
            </View>
          </ScrollView>
        )}
      </View>

      {threads === null ? (
        <View style={{ gap: space.s3, paddingHorizontal: space.s4 }}>
          <Skeleton height={68} radius={radius.lg} />
          <Skeleton height={68} radius={radius.lg} />
          <Skeleton height={68} radius={radius.lg} />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            threads.length === 0
              ? 'No messages yet'
              : query
                ? 'Nobody by that name'
                : 'All caught up'
          }
          message={
            threads.length === 0
              ? 'Message a pro before you book, or reply to a request — conversations show up here.'
              : query
                ? 'Try a different name.'
                : 'Every conversation has been answered.'
          }
          actionTitle={threads.length === 0 ? 'Find a pro' : undefined}
          onAction={threads.length === 0 ? () => router.push('/search') : undefined}
        />
      ) : (
        <View style={{ paddingHorizontal: space.s4, gap: space.s2 }}>
          {visible.map(({ thread, other, last, unread, mine }, index) => (
            <FadeSlideIn key={thread.id} delay={Math.min(index, 8) * 40}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Chat with ${other?.full_name ?? 'Unknown'}${
                  unread ? ', unread' : ''
                }`}
                onPress={() => {
                  lightTap();
                  router.push(`/thread/${thread.id}`);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.s3,
                  padding: space.s3,
                  borderRadius: radius.lg,
                  backgroundColor: unread ? colors.accentSoft : colors.surface,
                  borderWidth: 1,
                  borderColor: unread ? colors.accent : colors.border,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Avatar name={other?.full_name ?? '?'} uri={other?.avatar_url} showStatusDot />
                <View style={{ flex: 1, gap: 3 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: space.s2,
                    }}
                  >
                    <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {other?.full_name ?? 'Unknown'}
                    </AppText>
                    <AppText variant="caption" color={unread ? 'accent' : 'textMuted'}>
                      {last ? timeAgo(last.created_at) : timeAgo(thread.last_message_at)}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
                    {/* Say what the last message WAS — a photo and a sentence
                        used to look identical in this list. */}
                    {mine && (
                      <Ionicons name="return-up-forward" size={12} color={colors.textMuted} />
                    )}
                    {last?.kind === 'image' && (
                      <Ionicons name="image" size={12} color={colors.textMuted} />
                    )}
                    {last?.kind === 'job_card' && (
                      <Ionicons name="briefcase" size={12} color={colors.accent} />
                    )}
                    <AppText
                      variant="bodySm"
                      color={unread ? 'text' : 'textMuted'}
                      numberOfLines={1}
                      style={{ flex: 1 }}
                    >
                      {last?.kind === 'image'
                        ? 'Photo'
                        : last?.kind === 'job_card'
                          ? 'Shared a booking'
                          : (last?.body ?? 'Say hello 👋')}
                    </AppText>
                  </View>
                </View>
                {unread && (
                  <View
                    style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent }}
                  />
                )}
              </Pressable>
            </FadeSlideIn>
          ))}
        </View>
      )}
    </Screen>
  );
}
