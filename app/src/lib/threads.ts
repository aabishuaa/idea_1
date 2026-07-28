import { supabase } from './supabase';

/**
 * Finds the conversation between a customer and a worker, creating it if this
 * is their first contact. `threads` is unique on (customer_id, worker_id), so
 * there is exactly one per pair no matter how many jobs they run together.
 *
 * Lives here because both the booking screen and the request-review screen
 * need it, and a second copy would eventually disagree with the first.
 */
export async function openThread(params: {
  customerId: string;
  workerId: string;
  jobId?: string | null;
}): Promise<string | null> {
  const { customerId, workerId, jobId } = params;

  const { data: existing } = await supabase
    .from('threads')
    .select('id')
    .eq('customer_id', customerId)
    .eq('worker_id', workerId)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created } = await supabase
    .from('threads')
    .insert({ customer_id: customerId, worker_id: workerId, job_id: jobId ?? null })
    .select('id')
    .single();
  return (created?.id as string | undefined) ?? null;
}

/** Sends a plain message into a thread. Returns false if it did not land. */
export async function sendMessage(
  threadId: string,
  senderId: string,
  body: string,
): Promise<boolean> {
  const text = body.trim();
  if (!text) return false;
  const { error } = await supabase
    .from('messages')
    .insert({ thread_id: threadId, sender_id: senderId, body: text, kind: 'text' });
  return !error;
}
