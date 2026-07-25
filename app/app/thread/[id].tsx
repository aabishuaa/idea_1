import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Message } from '@/types/db';

/** Chat over Supabase Realtime (FR-MSG-1). */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', id)
      .order('created_at', { ascending: true });
    const rows = (data as Message[] | null) ?? [];
    setMessages(rows);

    // Mark the other side's messages read.
    if (session) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('thread_id', id)
        .neq('sender_id', session.user.id)
        .is('read_at', null);
    }
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
            const next = payload.new as Message;
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

  const send = async () => {
    const body = draft.trim();
    if (!body || !session || !id) return;
    setDraft('');
    const { data } = await supabase
      .from('messages')
      .insert({ thread_id: id, sender_id: session.user.id, body })
      .select('*')
      .single();
    if (data) {
      setMessages((current) =>
        current.some((m) => m.id === (data as Message).id)
          ? current
          : [...current, data as Message],
      );
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: space.s4, gap: space.s2 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.sender_id === session?.user.id;
          return (
            <View
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: mine ? colors.primary : colors.surface,
                borderWidth: mine ? 0 : 1,
                borderColor: colors.border,
                borderRadius: radius.lg,
                borderBottomRightRadius: mine ? radius.sm : radius.lg,
                borderBottomLeftRadius: mine ? radius.lg : radius.sm,
                paddingHorizontal: space.s3,
                paddingVertical: space.s2,
              }}
            >
              <AppText variant="bodySm" style={{ color: mine ? '#FFFFFF' : colors.text }}>
                {item.body}
              </AppText>
            </View>
          );
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s2,
          padding: space.s4,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Input
            placeholder="Type a message…"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={send}
          disabled={!draft.trim()}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.full,
            backgroundColor: draft.trim() ? (pressed ? colors.primaryHover : colors.primary) : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: draft.trim() ? 0 : 1,
            borderColor: colors.border,
          })}
        >
          <Ionicons name="send" size={18} color={draft.trim() ? '#FFFFFF' : colors.textMuted} />
        </Pressable>
      </View>
    </Screen>
  );
}
