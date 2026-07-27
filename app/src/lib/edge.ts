/**
 * Supabase Edge Function clients (extract-intent, embed-text, bizbot).
 * These carry the caller's JWT; the functions verify it server-side.
 */

import { supabase } from './supabase';
import type { ChatTurn, RagAnswer } from './ai';

export interface JobIntent {
  job_type: string | null;
  location: string | null;
  urgency: 'low' | 'normal' | 'high' | 'emergency';
  budget: { min_jmd: number | null; max_jmd: number | null };
}

export interface ExtractIntentResult {
  intent: JobIntent;
  /** Query embedding for semantic matching; null if embeddings were unavailable. */
  embedding: number[] | null;
  provider: string;
}

export async function extractIntent(description: string): Promise<ExtractIntentResult> {
  const { data, error } = await supabase.functions.invoke<ExtractIntentResult>(
    'extract-intent',
    { body: { description } },
  );
  if (error || !data) {
    throw new Error(error?.message ?? 'extract-intent failed');
  }
  return data;
}

export async function embedService(serviceId: string): Promise<void> {
  // Failure is non-fatal by design: matching falls back to trade/parish
  // filters until the embedding exists (the function can be retried).
  const { error } = await supabase.functions.invoke('embed-text', {
    body: { service_id: serviceId },
  });
  if (error) {
    console.warn('[myB] embed-text failed (semantic matching degraded):', error.message);
  }
}


/**
 * BizBot via the Supabase edge function. Retrieval is Postgres full-text over
 * the knowledge base, so this works with only Supabase + an LLM key — no
 * Python service and no embeddings required.
 */
export async function askBizBotEdge(
  question: string,
  history: ChatTurn[],
  parish?: string | null,
): Promise<RagAnswer> {
  const { data, error } = await supabase.functions.invoke<RagAnswer>('bizbot', {
    body: { question, country: 'JM', parish: parish ?? null, history: history.slice(-6) },
  });
  if (error || !data) {
    throw new Error(error?.message ?? 'bizbot failed');
  }
  return data;
}
