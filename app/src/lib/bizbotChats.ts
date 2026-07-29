import { supabase } from './supabase';
import type { RagSource } from './ai';

export interface BizBotConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: RagSource[];
  created_at: string;
}

export interface BizBotTip {
  id: number;
  category: string;
  headline: string;
  body: string;
  source_name: string;
  source_url: string;
}

/**
 * Saved BizBot chats (migration 0022).
 *
 * Backing out of the chat used to throw the whole conversation away, which is
 * hostile for exactly the questions people ask here — you look something up
 * about registering a business, then want to check it again a week later when
 * you are actually at the agency.
 */
export async function listConversations(limit = 30): Promise<BizBotConversation[]> {
  const { data } = await supabase
    .from('bizbot_conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data as BizBotConversation[] | null) ?? [];
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const { data } = await supabase
    .from('bizbot_messages')
    .select('id, role, content, sources, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  return (data as StoredMessage[] | null) ?? [];
}

/** A chat titles itself from the first thing asked. */
export function titleFrom(question: string): string {
  const clean = question.trim().replace(/\s+/g, ' ');
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 45).trimEnd()}…`;
}

export async function createConversation(
  userId: string,
  firstQuestion: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('bizbot_conversations')
    .insert({ user_id: userId, title: titleFrom(firstQuestion) })
    .select('id')
    .single();
  return (data?.id as string | undefined) ?? null;
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources: RagSource[] = [],
): Promise<void> {
  await supabase
    .from('bizbot_messages')
    .insert({ conversation_id: conversationId, role, content, sources });
}

/** Purge — the user's own chats, gone for good (cascade removes messages). */
export async function deleteConversation(id: string): Promise<void> {
  await supabase.from('bizbot_conversations').delete().eq('id', id);
}

export async function deleteAllConversations(userId: string): Promise<void> {
  await supabase.from('bizbot_conversations').delete().eq('user_id', userId);
}

/** Sourced "did you know" facts. Config rows, never model output. */
export async function listTips(): Promise<BizBotTip[]> {
  const { data } = await supabase
    .from('bizbot_tips')
    .select('id, category, headline, body, source_name, source_url')
    .order('sort_order');
  return (data as BizBotTip[] | null) ?? [];
}
