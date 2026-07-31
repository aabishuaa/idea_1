import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { lightTap, successTap } from '@/components/ui/animated';
import { pickImage, uploadTo } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, radius, space } from '@/theme/tokens';
import type { Job, Message } from '@/types/db';

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
  const [uploading, setUploading] = useState(false);
  const [sharedJobs, setSharedJobs] = useState<Record<string, Job>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
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

    const threadRow = threadRes.data as {
      customer_id: string;
      worker_id: string;
      job_id: string | null;
      customer: Counterparty | null;
      worker: Counterparty | null;
    } | null;
    if (threadRow) {
      const mine = session.user.id === threadRow.customer_id;
      setOther(mine ? threadRow.worker : threadRow.customer);
    }

    // Resolve every job referenced in this conversation (the thread's own job
    // plus any job cards shared into it) so the cards can render titles.
    const rows = (messagesRes.data as ChatMessage[] | null) ?? [];
    const jobIds = new Set<string>();
    if (threadRow?.job_id) jobIds.add(threadRow.job_id);
    rows.forEach((message) => {
      if (message.job_id) jobIds.add(message.job_id);
    });
    if (jobIds.size > 0) {
      const { data: jobRows } = await supabase
        .from('jobs')
        .select('*')
        .in('id', [...jobIds]);
      const map: Record<string, Job> = {};
      (jobRows as Job[] | null)?.forEach((job) => {
        map[job.id] = job;
      });
      // sharedJobs still backs the job cards already in the history; the
      // thread's own job no longer needs its own state now that nothing
      // composes a new card from it.
      setSharedJobs(map);
    }

    // Signed URLs for image attachments (the bucket is private).
    const paths = rows
      .filter((message) => message.kind === 'image' && message.attachment_path)
      .map((message) => message.attachment_path as string);
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrls(paths, 3600);
      const urlMap: Record<string, string> = {};
      signed?.forEach((entry) => {
        if (entry.path && entry.signedUrl) urlMap[entry.path] = entry.signedUrl;
      });
      setSignedUrls((current) => ({ ...current, ...urlMap }));
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

  /*
    The header shows who you are talking to, and opens them.

    A chat is exactly where "who IS this person" comes up — you are arranging
    for a stranger to come to your house, or going to theirs — so the name at
    the top is a button, not a label.
  */
  useEffect(() => {
    if (!other) return;
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${other.full_name}. Open profile.`}
          onPress={() => {
            lightTap();
            router.push({ pathname: '/person/[id]', params: { id: other.id } });
          }}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s2,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Avatar name={other.full_name} uri={other.avatar_url} size="sm" />
          <AppText variant="label" numberOfLines={1}>
            {other.full_name}
          </AppText>
        </Pressable>
      ),
    });
  }, [navigation, other]);

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

  /** Attach a photo — how people actually describe a job. */
  const attachImage = async () => {
    if (!session || !id) return;
    // Shared picker: asks for permission properly, says so when it is denied,
    // and returns the bytes rather than a URI we would have to re-read.
    const image = await pickImage();
    if (!image) return;

    setUploading(true);
    try {
      // Files live under <thread_id>/… so storage policies can authorise by
      // thread membership rather than by uploader.
      const path = await uploadTo(
        'chat-attachments',
        `${id}/${Date.now()}.${image.extension}`,
        image,
      );
      if (!path) return;

      const { data } = await supabase
        .from('messages')
        .insert({
          thread_id: id,
          sender_id: session.user.id,
          body: '📷 Photo',
          kind: 'image',
          attachment_path: path,
          attachment_mime: image.mimeType,
        })
        .select('*')
        .single();

      const { data: signed } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path, 3600);
      if (signed?.signedUrl) {
        setSignedUrls((current) => ({ ...current, [path]: signed.signedUrl }));
      }
      if (data) {
        const saved = data as ChatMessage;
        setMessages((current) =>
          current.some((m) => m.id === saved.id) ? current : [...current, saved],
        );
      }
      successTap();
    } finally {
      setUploading(false);
    }
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
                  {message.kind === 'image' && message.attachment_path ? (
                    signedUrls[message.attachment_path] ? (
                      <Image
                        source={{ uri: signedUrls[message.attachment_path] }}
                        style={{ width: 200, height: 200, borderRadius: radius.md }}
                        resizeMode="cover"
                        accessibilityLabel="Photo attachment"
                      />
                    ) : (
                      <View
                        style={{
                          width: 200,
                          height: 200,
                          borderRadius: radius.md,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.surfaceRaised,
                        }}
                      >
                        <ActivityIndicator color={colors.accent} />
                      </View>
                    )
                  ) : message.kind === 'job_card' && message.job_id ? (
                    // A booking shared into the conversation — tapping opens it.
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Open booking ${sharedJobs[message.job_id]?.title ?? ''}`}
                      onPress={() =>
                        router.push({
                          pathname: '/job/[id]',
                          params: { id: message.job_id as string },
                        })
                      }
                      style={{ gap: space.s2, minWidth: 200 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                        <Ionicons
                          name="briefcase"
                          size={14}
                          color={mine ? 'rgba(255,255,255,0.9)' : colors.accent}
                        />
                        <AppText
                          variant="caption"
                          style={{ color: mine ? 'rgba(255,255,255,0.9)' : colors.accent }}
                        >
                          BOOKING
                        </AppText>
                      </View>
                      <AppText
                        variant="label"
                        numberOfLines={2}
                        style={{ color: mine ? '#FFFFFF' : colors.text }}
                      >
                        {sharedJobs[message.job_id]?.title ?? message.body}
                      </AppText>
                      <AppText
                        variant="caption"
                        style={{ color: mine ? 'rgba(255,255,255,0.75)' : colors.textMuted }}
                      >
                        {sharedJobs[message.job_id]?.status.replace('_', ' ') ?? 'booking'} · tap
                        to open
                      </AppText>
                    </Pressable>
                  ) : (
                    <AppText variant="bodySm" style={{ color: mine ? '#FFFFFF' : colors.text }}>
                      {message.body}
                    </AppText>
                  )}
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
        {/* Attach a photo */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          onPress={() => void attachImage()}
          disabled={uploading}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed || uploading ? 0.6 : 1,
          })}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="image-outline" size={19} color={colors.accent} />
          )}
        </Pressable>

        {/*
          The "share this booking" button was removed deliberately. It posted a
          job card into the thread, but the chat is already opened FROM a
          booking and the header names it — so the card restated what the
          screen already said, and the insert had its own bugs on top of that.
          Existing job_card messages still render (see the message list) so
          nothing already sent disappears; there is just no longer a way to
          send a new one.
        */}
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
