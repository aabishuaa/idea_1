import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/states';
import { lightTap } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, radius, space } from '@/theme/tokens';
import type { Message } from '@/types/db';

interface Counterparty {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/** Message plus the UI-only state we need for delivery feedback. */
type ChatMessage = Message & { pending?: boolean; failed?: boolean };

/** A rendered list row: either a day separator or a message bubble. */
type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: ChatMessage };

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Today';
  if (same(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-JM', { weekday: 'long', day: 'numeric', month: 'short' });
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Chat over Supabase Realtime (FR-MSG-1).
 *
 * The keyboard handling is deliberate: this screen sits inside a native stack
 * with a header, so KeyboardAvoidingView needs the header height as its offset.
 * Without it the composer is pushed off the bottom of the screen when the
 * keyboard opens, which is exactly what was happening.
 */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [other, setOther] = useState<Counterparty | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<FlatList<ChatRow>>(null);

  const load = useCallback(async () => {
    if (!id || !session) return;

    const [messagesRes, threadRes] = await Promise.all([
      supabase.from('messages').select('*').eq('thread_id', id).order('created_at'),
      supabase
        .from('threads')
        .select(
          `customer_id, worker_id, job_id,
           customer:profiles!threads_customer_id_fkey(id, full_name, avatar_url),
           worker:profiles!threads_worker_id_fkey(id, full_name, avatar_url)`,
        )
        .eq('id', id)
        .maybeSingle(),
    ]);

    setMessages((messagesRes.data as ChatMessage[] | null) ?? []);
    setLoaded(true);

    const thread = threadRes.data as {
      customer_id: string;
      worker_id: string;
      customer: Counterparty | null;
      worker: Counterparty | null;
    } | null;
    if (thread) {
      const mine = session.user.id === thread.customer_id;
      setOther(mine ? thread.worker : thread.customer);
    }

    // Mark the other side's messages as read.
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', id)
      .neq('sender_id', session.user.id)
      .is('read_at', null);
  }, [id, session]);

  useEffect(() => {
    void load();
    if (!id) return;

    const channel = supabase
      .channel(`thread-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${id}` },
        (payload) => {
          setMessages((current) => {
            const next = payload.new as ChatMessage;
            if (current.some((m) => m.id === next.id)) return current;
            return [...current, next];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  // Put the counterparty's name in the header instead of a generic "Chat".
  useEffect(() => {
    if (other?.full_name) navigation.setOptions({ title: other.full_name });
  }, [navigation, other?.full_name]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !session || !id) return;
    lightTap();
    setDraft('');

    // Optimistic bubble so sending feels instant, reconciled on insert.
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      thread_id: id,
      sender_id: session.user.id,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);

    const { data, error } = await supabase
      .from('messages')
      .insert({ thread_id: id, sender_id: session.user.id, body })
      .select('*')
      .single();

    setMessages((current) => {
      const withoutTemp = current.filter((m) => m.id !== tempId);
      if (error || !data) {
        return [...withoutTemp, { ...optimistic, pending: false, failed: true }];
      }
      const saved = data as ChatMessage;
      return withoutTemp.some((m) => m.id === saved.id)
        ? withoutTemp
        : [...withoutTemp, saved];
    });
  };

  /** Rows = day separators interleaved with messages. */
  const rows = useMemo<ChatRow[]>(() => {
    const out: ChatRow[] = [];
    let lastDay = '';
    messages.forEach((message) => {
      const label = dayLabel(message.created_at);
      if (label !== lastDay) {
        out.push({ kind: 'day', key: `day-${label}-${message.id}`, label });
        lastDay = label;
      }
      out.push({ kind: 'msg', key: message.id, message });
    });
    return out;
  }, [messages]);

  const canSend = draft.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // The stack header height — without this the composer goes off-screen.
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{
          padding: space.s4,
          gap: space.s2,
          flexGrow: 1,
          justifyContent: rows.length === 0 ? 'center' : 'flex-start',
        }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              title={other ? `Say hello to ${other.full_name.split(' ')[0]}` : 'No messages yet'}
              message="Agree the job, the time and the price here — everything stays on record."
            />
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'day') {
            return (
              <View style={{ alignItems: 'center', paddingVertical: space.s2 }}>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.full,
                    paddingHorizontal: space.s3,
                    paddingVertical: 3,
                  }}
                >
                  <AppText variant="caption" color="textMuted">
                    {item.label}
                  </AppText>
                </View>
              </View>
            );
          }

          const message = item.message;
          const mine = message.sender_id === session?.user.id;
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: space.s2,
                justifyContent: mine ? 'flex-end' : 'flex-start',
              }}
            >
              {!mine && (
                <Avatar name={other?.full_name ?? '?'} uri={other?.avatar_url} size="sm" />
              )}
              <View style={{ maxWidth: '78%' }}>
                <View
                  style={{
                    backgroundColor: mine ? colors.primary : colors.surface,
                    borderWidth: mine ? 0 : 1,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    borderBottomRightRadius: mine ? radius.sm : radius.lg,
                    borderBottomLeftRadius: mine ? radius.lg : radius.sm,
                    paddingHorizontal: space.s3,
                    paddingVertical: space.s2,
                    opacity: message.pending ? 0.6 : 1,
                  }}
                >
                  <AppText variant="bodySm" style={{ color: mine ? '#FFFFFF' : colors.text }}>
                    {message.body}
                  </AppText>
                </View>
                {/* Timestamp + delivery state */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 2,
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  <AppText variant="caption" color={message.failed ? 'error' : 'textMuted'}>
                    {message.failed ? 'Not sent — tap to retry' : clockTime(message.created_at)}
                  </AppText>
                  {mine && !message.failed && (
                    <Ionicons
                      name={
                        message.pending
                          ? 'time-outline'
                          : message.read_at
                            ? 'checkmark-done'
                            : 'checkmark'
                      }
                      size={13}
                      color={message.read_at ? colors.accent : colors.textMuted}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Composer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: space.s2,
          paddingHorizontal: space.s4,
          paddingTop: space.s3,
          paddingBottom: Math.max(insets.bottom, space.s3),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            paddingHorizontal: space.s3,
            paddingVertical: Platform.OS === 'ios' ? space.s2 : 0,
          }}
        >
          <TextInput
            style={{
              flex: 1,
              fontFamily: fonts.regular,
              fontSize: 15,
              color: colors.text,
              maxHeight: 110,
              paddingVertical: Platform.OS === 'ios' ? 4 : space.s2,
            }}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            returnKeyType="default"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={() => void send()}
          disabled={!canSend}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.full,
            backgroundColor: canSend
              ? pressed
                ? colors.primaryHover
                : colors.primary
              : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: canSend ? 0 : 1,
            borderColor: colors.border,
          })}
        >
          <Ionicons name="send" size={18} color={canSend ? '#FFFFFF' : colors.textMuted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
