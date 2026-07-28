import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { IncomingRequest } from '@/types/db';

interface RequestsContextValue {
  /** null while the first load is in flight. */
  requests: IncomingRequest[] | null;
  count: number;
  /** Requests that landed while the app has been open — these glow. */
  freshIds: Set<string>;
  /** The newest arrival, for the banner. Cleared once shown. */
  arrival: IncomingRequest | null;
  dismissArrival: () => void;
  refresh: () => Promise<void>;
  clearFresh: (id: string) => void;
}

const RequestsContext = createContext<RequestsContextValue | null>(null);

/**
 * Every unanswered job request for the signed-in worker, in one place.
 *
 * A provider rather than a hook because three things need the same data and
 * must not each open their own realtime channel: the bookings inbox, the tab
 * badge, and the banner that drops in when a request arrives.
 *
 * Reads through get_incoming_requests() (migration 0018) rather than a plain
 * select, because deciding on a request needs the customer's name and
 * verification status, and RLS on `profiles` deliberately does not hand out
 * arbitrary people. Realtime comes from publishing `jobs` (migration 0019).
 */
export function RequestsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [requests, setRequests] = useState<IncomingRequest[] | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [arrival, setArrival] = useState<IncomingRequest | null>(null);
  // Rows present on the first load are existing work, not arrivals — only what
  // shows up after that gets the banner and the glow.
  const settled = useRef(false);
  const known = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) {
      setRequests([]);
      known.current = new Set();
      settled.current = false;
      return;
    }
    const { data } = await supabase.rpc('get_incoming_requests');
    const rows = (data as IncomingRequest[] | null) ?? [];

    if (settled.current) {
      const arrivals = rows.filter((row) => !known.current.has(row.id));
      if (arrivals.length > 0) {
        setFreshIds((current) => new Set([...current, ...arrivals.map((row) => row.id)]));
        // Newest first from the RPC, so the head is the one to announce.
        setArrival(arrivals[0] ?? null);
      }
    }
    known.current = new Set(rows.map((row) => row.id));
    settled.current = true;
    setRequests(rows);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`jobs-for-worker-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `worker_id=eq.${userId}` },
        () => {
          // Re-read instead of trusting the payload: the RPC carries the
          // customer's profile, and an UPDATE means a request left the list.
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const clearFresh = useCallback((id: string) => {
    setFreshIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const dismissArrival = useCallback(() => setArrival(null), []);

  const value = useMemo(
    () => ({
      requests,
      count: requests?.length ?? 0,
      freshIds,
      arrival,
      dismissArrival,
      refresh,
      clearFresh,
    }),
    [requests, freshIds, arrival, dismissArrival, refresh, clearFresh],
  );

  return <RequestsContext.Provider value={value}>{children}</RequestsContext.Provider>;
}

export function useRequests(): RequestsContextValue {
  const ctx = useContext(RequestsContext);
  if (!ctx) throw new Error('useRequests must be used inside RequestsProvider');
  return ctx;
}
