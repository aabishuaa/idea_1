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
  /** A short title naming the job. Null when the LLM only echoed the text. */
  title?: string | null;
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

// Saving several services fires several embed calls; if the function is down
// (no LLM key, not deployed) every one of them logged, filling the terminal
// with the same line. Say it once.
let embedWarned = false;

export async function embedService(serviceId: string): Promise<void> {
  // Failure is non-fatal by design: matching falls back to text/trade/parish
  // search until the embedding exists (the function can be retried). Semantic
  // ranking is an enhancement on top of search that always works.
  const { error } = await supabase.functions.invoke('embed-text', {
    body: { service_id: serviceId },
  });
  if (error && !embedWarned) {
    embedWarned = true;
    console.warn(
      '[myB] embed-text unavailable — semantic ranking is off, text search still works.',
      error.message,
    );
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
