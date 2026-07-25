/**
 * Analytics event capture (FR-ANL-1): raw material for labour-market insights
 * (most-demanded trades, geographic demand, activity patterns). Fire-and-forget
 * — analytics must never block or break UX. Aggregation/anonymization happens
 * server-side before any secondary use (SR-19).
 */

import { supabase } from './supabase';

type EventType =
  | 'job_search'
  | 'job_request_created'
  | 'worker_profile_viewed'
  | 'formalization_activated'
  | 'bizbot_question';

export function logEvent(
  eventType: EventType,
  fields: { trade_slug?: string | null; parish?: string | null; payload?: Record<string, unknown> } = {},
): void {
  void (async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('events').insert({
      user_id: userId,
      event_type: eventType,
      trade_slug: fields.trade_slug ?? null,
      parish: fields.parish ?? null,
      payload: fields.payload ?? {},
    });
  })().catch(() => {
    // Analytics is best-effort by design.
  });
}
