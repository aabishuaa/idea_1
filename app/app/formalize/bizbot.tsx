import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerBody } from '@/features/bizbot/AnswerBody';
import { AnswerBadge, BizBotHeader, BizBotMark } from '@/features/bizbot/BizBotMark';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, TypingDots, lightTap } from '@/components/ui/animated';
import { askBizBot, type ChatTurn, type RagSource } from '@/lib/ai';
import {
  createConversation,
  loadMessages,
  saveMessage,
  type BizBotTip,
  listTips,
} from '@/lib/bizbotChats';
import { answerFromStats, fetchBusinessStats, isPersonalQuestion } from '@/lib/bizbotStats';
import { logEvent } from '@/lib/events';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface BotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: RagSource[];
  pending?: boolean;
  /** Which tier produced the answer, so the UI can say so. */
  origin?: 'written' | 'quoted' | 'your-record';
}

const SUGGESTED = [
  'Do I need a TRN?',
  'What is GCT?',
  'How do I register my business name?',
  'How many jobs did I book this month?',
];

const WELCOME: BotMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Wah gwaan! Mi a BizBot. Ask me anything about making your business official — TRN, registration, taxes, NIS — and mi can tell you about your own myB numbers too.",
};

/**
 * BizBot (FR-BIZ-4/5).
 *
 * Three kinds of answer, kept visibly distinct because they have different
 * warrants: a written answer from the official sources, the sources quoted
 * verbatim when no LLM is reachable, and your own numbers straight from the
 * database. Deterministic content — the checklist, fees, your earnings — is
 * never generated (CLAUDE.md §4.3).
 */
export default function BizBotScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { profile, session } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<BotMessage>>(null);

  const [messages, setMessages] = useState<BotMessage[]>([WELCOME]);
  const [draft, setDraft] = useState(q ?? '');
  const [busy, setBusy] = useState(false);
  const [tips, setTips] = useState<BizBotTip[]>([]);
  const [tipIndex, setTipIndex] = useState(0);
  // Created lazily on the first question, so opening BizBot and leaving does
  // not litter the list with empty chats.
  const conversationId = useRef<string | null>(null);

  // BizBot's own identity in the header, plus the way back to saved chats.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <BizBotHeader />,
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saved chats"
          hitSlop={10}
          onPress={() => {
            lightTap();
            router.push('/formalize/chats');
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name="time-outline" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, colors.text]);

  useEffect(() => {
    void listTips().then(setTips);
  }, []);

  // Rotate the tip so the empty state is not the same fact every time.
  useEffect(() => {
    if (tips.length < 2) return;
    const timer = setInterval(() => setTipIndex((current) => (current + 1) % tips.length), 7000);
    return () => clearInterval(timer);
  }, [tips.length]);

  /** Reopening a saved chat. */
  const restore = useCallback(async (id: string) => {
    conversationId.current = id;
    const stored = await loadMessages(id);
    setMessages([
      WELCOME,
      ...stored.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sources: message.sources ?? [],
        origin: 'written' as const,
      })),
    ]);
  }, []);

  const { chat } = useLocalSearchParams<{ chat?: string }>();
  useEffect(() => {
    if (chat) void restore(chat);
  }, [chat, restore]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    lightTap();
    setDraft('');
    setBusy(true);

    const userMessage: BotMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const pendingMessage: BotMessage = {
      id: `p-${Date.now()}`,
      role: 'assistant',
      content: '',
      pending: true,
    };
    setMessages((current) => [...current, userMessage, pendingMessage]);
    logEvent('bizbot_question', { parish: profile?.parish });

    const history: ChatTurn[] = messages
      .filter((message) => !message.pending && message.id !== 'welcome')
      .map((message) => ({ role: message.role, content: message.content }));

    // Start (or continue) the saved conversation.
    if (!conversationId.current && session) {
      conversationId.current = await createConversation(session.user.id, text);
    }
    if (conversationId.current) void saveMessage(conversationId.current, 'user', text);

    const deliver = (message: BotMessage) => {
      setMessages((current) => [...current.filter((item) => !item.pending), message]);
      if (conversationId.current) {
        void saveMessage(conversationId.current, 'assistant', message.content, message.sources ?? []);
      }
    };

    try {
      /*
        Questions about YOUR numbers never touch the language model. A count of
        your jobs or a total of your earnings either matches the database
        exactly or the app is lying to somebody about their own income — and
        this product's whole claim is that the record is trustworthy enough to
        take to a lender.
      */
      if (isPersonalQuestion(text)) {
        const stats = await fetchBusinessStats();
        const personal = stats ? answerFromStats(text, stats) : null;
        if (personal) {
          deliver({
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: personal.answer,
            sources: [],
            origin: 'your-record',
          });
          return;
        }
      }

      const answer = await askBizBot(text, history, profile?.parish);
      deliver({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: answer.answer,
        sources: answer.grounded ? answer.sources : [],
        origin: answer.provider === 'sources' ? 'quoted' : 'written',
      });
    } catch (error) {
      setMessages((current) => [
        ...current.filter((message) => !message.pending),
        { id: `e-${Date.now()}`, role: 'assistant', content: diagnose(error) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const tip = tips[tipIndex];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // Without the header offset the composer slid UNDER the keyboard and you
      // could not see what you were typing.
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={{ padding: space.s4, gap: space.s4 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.role === 'user';

          if (mine) {
            return (
              <FadeSlideIn from="right" distance={12} duration={240}>
                <View
                  style={{
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                    backgroundColor: colors.primary,
                    borderRadius: radius.lg,
                    borderBottomRightRadius: radius.sm,
                    paddingHorizontal: space.s4,
                    paddingVertical: space.s3,
                  }}
                >
                  <AppText variant="bodySm" style={{ color: '#FFFFFF' }}>
                    {item.content}
                  </AppText>
                </View>
              </FadeSlideIn>
            );
          }

          /* BizBot's side: a card with an author, not an anonymous grey slab. */
          return (
            <FadeSlideIn from="left" distance={12} duration={260}>
              <View style={{ flexDirection: 'row', gap: space.s2, alignItems: 'flex-start' }}>
                <BizBotMark size={30} thinking={item.pending} />
                <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.lg,
                      borderTopLeftRadius: radius.sm,
                      paddingHorizontal: space.s4,
                      paddingVertical: item.pending ? space.s4 : space.s3,
                      gap: space.s3,
                    }}
                  >
                    {item.pending ? (
                      <TypingDots />
                    ) : (
                      <>
                        {item.origin && <AnswerBadge kind={item.origin} />}
                        <AnswerBody content={item.content} />
                      </>
                    )}
                  </View>

                  {item.sources && item.sources.length > 0 && (
                    <View style={{ gap: space.s1 }}>
                      {dedupeSources(item.sources).map((source, index) => (
                        <Pressable
                          key={`${item.id}-src-${index}`}
                          accessibilityRole="link"
                          accessibilityLabel={`Source: ${source.title}`}
                          disabled={!source.source_url}
                          onPress={() =>
                            source.source_url && Linking.openURL(source.source_url)
                          }
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: space.s2,
                            paddingVertical: space.s2,
                            paddingHorizontal: space.s3,
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: colors.border,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Ionicons name="link-outline" size={13} color={colors.accent} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <AppText variant="caption" numberOfLines={1}>
                              {source.title}
                            </AppText>
                            {source.source_name ? (
                              <AppText
                                variant="caption"
                                color="textMuted"
                                numberOfLines={1}
                                style={{ fontSize: 10 }}
                              >
                                {source.source_name}
                              </AppText>
                            ) : null}
                          </View>
                          {source.source_url ? (
                            <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </FadeSlideIn>
          );
        }}
        ListFooterComponent={
          messages.length <= 1 ? (
            <View style={{ gap: space.s4, paddingTop: space.s4 }}>
              {/* Did you know — sourced facts, rotating. */}
              {tip && (
                <FadeSlideIn key={tip.id} from="bottom" distance={10}>
                  <View
                    style={{
                      gap: space.s2,
                      padding: space.s4,
                      borderRadius: radius.lg,
                      backgroundColor: colors.accentSoft,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                      <Ionicons name="bulb" size={14} color={colors.accent} />
                      <AppText variant="overline" color="accent">
                        Did you know
                      </AppText>
                    </View>
                    <AppText variant="label">{tip.headline}</AppText>
                    <AppText variant="bodySm" color="textMuted">
                      {tip.body}
                    </AppText>
                    {tip.source_name ? (
                      <AppText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                        Source: {tip.source_name}
                      </AppText>
                    ) : null}
                  </View>
                </FadeSlideIn>
              )}

              <View style={{ gap: space.s2 }}>
                <AppText variant="overline" color="textMuted">
                  Try asking
                </AppText>
                {SUGGESTED.map((question) => (
                  <Pressable
                    key={question}
                    accessibilityRole="button"
                    onPress={() => void ask(question)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.s2,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.full,
                      paddingHorizontal: space.s4,
                      paddingVertical: space.s3,
                      alignSelf: 'flex-start',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="chatbubble-outline" size={13} color={colors.accent} />
                    <AppText variant="bodySm" color="accent">
                      {question}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
      />

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
        <View style={{ flex: 1 }}>
          <Input
            placeholder="Ask about TRN, GCT, registration…"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void ask(draft)}
            returnKeyType="send"
            editable={!busy}
            multiline
            style={{ maxHeight: 110 }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask BizBot"
          onPress={() => void ask(draft)}
          disabled={!draft.trim() || busy}
          style={({ pressed }) => ({
            width: 46,
            height: 46,
            borderRadius: radius.full,
            backgroundColor:
              draft.trim() && !busy
                ? pressed
                  ? colors.primaryHover
                  : colors.primary
                : colors.surface,
            borderWidth: draft.trim() && !busy ? 0 : 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={draft.trim() && !busy ? '#FFFFFF' : colors.textMuted}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Retrieval returns several chunks of the same document, which listed three
 * identical "Getting a TRN — Tax Administration Jamaica" links under one
 * answer. One entry per document.
 */
function dedupeSources(sources: RagSource[]): RagSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.title}|${source.source_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Turn a failure into something actionable.
 *
 * Reaching here means even reading the knowledge base directly failed, so the
 * problem is the database or the session — not the LLM, and not the edge
 * function, both of which BizBot now survives without.
 */
function diagnose(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/not signed in|JWT|401/i.test(message)) {
    return "Mi can't check who you are right now. Sign out and back in, then ask me again.";
  }
  if (/knowledge base unavailable/i.test(message)) {
    return "The knowledge base isn't set up on this project yet. Apply the migrations and the seed (supabase db push, then run seed.sql) and mi will have the official documents to answer from.";
  }
  if (/Network|fetch|unreachable|timeout/i.test(message)) {
    return "Mi can't reach the network right now. Check your connection and try again.";
  }
  return `Mi hit a problem answering that one: ${message}`;
}
