import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { FlatList, Linking, Pressable, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, TypingDots, lightTap } from '@/components/ui/animated';
import { askBizBot, type ChatTurn, type RagSource } from '@/lib/ai';
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
}

const SUGGESTED = ['Do I need a TRN?', 'What is GCT?', 'How do I register my business name?'];

/**
 * BizBot chat (FR-BIZ-4/5): open Q&A via RAG, grounded in the tagged KB and
 * always citing sources. Deterministic pathway data lives in the checklist —
 * this chat never generates checklists or fees.
 */
export default function BizBotScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const listRef = useRef<FlatList<BotMessage>>(null);
  const [messages, setMessages] = useState<BotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Wah gwaan! Mi a BizBot 🤝 Ask me anything about making your business official — TRN, registration, taxes, NIS. I answer from official sources and show you where it comes from.",
    },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

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

    try {
      const answer = await askBizBot(text, history, profile?.parish);
      setMessages((current) => [
        ...current.filter((message) => !message.pending),
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: answer.answer,
          sources: answer.grounded ? answer.sources : [],
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current.filter((message) => !message.pending),
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content:
            "Mi can't reach the knowledge base right now — the service may be waking up (free tier takes a minute). Try again shortly.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={{ padding: space.s4, gap: space.s3 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          return (
            <FadeSlideIn from={mine ? 'right' : 'left'} distance={12} duration={260} style={{ gap: space.s2 }}>
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  backgroundColor: mine ? colors.primary : colors.surface,
                  borderWidth: mine ? 0 : 1,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  borderBottomLeftRadius: mine ? radius.lg : radius.sm,
                  borderBottomRightRadius: mine ? radius.sm : radius.lg,
                  paddingHorizontal: space.s3,
                  paddingVertical: item.pending ? space.s3 : space.s2,
                }}
              >
                {item.pending ? (
                  <TypingDots />
                ) : (
                  <AppText variant="bodySm" style={{ color: mine ? '#FFFFFF' : colors.text }}>
                    {item.content}
                  </AppText>
                )}
              </View>
              {item.sources && item.sources.length > 0 && (
                <View style={{ gap: space.s1, paddingLeft: space.s2 }}>
                  <AppText variant="caption" color="textMuted">
                    Sources:
                  </AppText>
                  {item.sources.slice(0, 3).map((source, index) => (
                    <Pressable
                      key={`${item.id}-src-${index}`}
                      accessibilityRole="link"
                      disabled={!source.source_url}
                      onPress={() => source.source_url && Linking.openURL(source.source_url)}
                    >
                      <AppText variant="caption" color="accent">
                        [{index + 1}] {source.title}
                        {source.source_name ? ` — ${source.source_name}` : ''}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              )}
            </FadeSlideIn>
          );
        }}
        ListFooterComponent={
          messages.length <= 1 ? (
            <View style={{ gap: space.s2, paddingTop: space.s4 }}>
              {SUGGESTED.map((question) => (
                <Pressable
                  key={question}
                  accessibilityRole="button"
                  onPress={() => void ask(question)}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.full,
                    paddingHorizontal: space.s4,
                    paddingVertical: space.s2,
                    alignSelf: 'flex-start',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <AppText variant="bodySm" color="accent">
                    {question}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null
        }
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
            placeholder="Ask about TRN, GCT, registration…"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void ask(draft)}
            returnKeyType="send"
            editable={!busy}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask BizBot"
          onPress={() => void ask(draft)}
          disabled={!draft.trim() || busy}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.full,
            backgroundColor:
              draft.trim() && !busy
                ? pressed
                  ? colors.primaryHover
                  : colors.primary
                : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: draft.trim() && !busy ? 0 : 1,
            borderColor: colors.border,
          })}
        >
          <Ionicons
            name="send"
            size={18}
            color={draft.trim() && !busy ? '#FFFFFF' : colors.textMuted}
          />
        </Pressable>
      </View>
    </Screen>
  );
}
