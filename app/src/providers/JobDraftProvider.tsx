import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { EMPTY_BUDGET, type Budget } from '@/components/BudgetRange';
import { EMPTY_WINDOW, type DateWindow } from '@/components/DateWindowPicker';
import type { PickedImage } from '@/lib/media';

export interface JobDraft {
  description: string;
  title: string;
  /**
   * When they need it. Replaced the single `urgency` adjective — the stored
   * urgency is now derived from these dates by the database (migration 0023).
   */
  when: DateWindow;
  /** A range, not a figure: the DB has always had budget_min/budget_max. */
  budget: Budget;
  tradeSlug: string | null;
  parish: string | null;
  photos: PickedImage[];
  /** True once the LLM (or the local generator) has named the job. */
  understood: boolean;
}

const EMPTY: JobDraft = {
  description: '',
  title: '',
  when: EMPTY_WINDOW,
  budget: EMPTY_BUDGET,
  tradeSlug: null,
  parish: null,
  photos: [],
  understood: false,
};

interface JobDraftContextValue {
  draft: JobDraft;
  /** True when there is enough here to send without asking again. */
  hasDraft: boolean;
  setDraft: (patch: Partial<JobDraft>) => void;
  clearDraft: () => void;
}

const JobDraftContext = createContext<JobDraftContextValue | null>(null);

/**
 * The job a customer is in the middle of describing.
 *
 * WHY THIS EXISTS
 * The flow was: describe the job (and attach photos) → see matching pros →
 * tap "Book now" → describe the job again. The second form was a different
 * screen instance with empty state, so everything typed and every photo
 * picked was thrown away at exactly the moment the customer had decided to
 * commit. That is the worst possible place to lose someone.
 *
 * Holding the draft in memory for the session means "Book now" can go
 * straight to a confirmation of what they already said, with the pro's name
 * on it. Deliberately not persisted: a half-written request should not
 * resurface days later as a surprise.
 */
export function JobDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraftState] = useState<JobDraft>(EMPTY);

  const setDraft = useCallback((patch: Partial<JobDraft>) => {
    setDraftState((current) => ({ ...current, ...patch }));
  }, []);

  const clearDraft = useCallback(() => setDraftState(EMPTY), []);

  const value = useMemo(
    () => ({
      draft,
      hasDraft: draft.description.trim().length >= 3,
      setDraft,
      clearDraft,
    }),
    [draft, setDraft, clearDraft],
  );

  return <JobDraftContext.Provider value={value}>{children}</JobDraftContext.Provider>;
}

export function useJobDraft(): JobDraftContextValue {
  const ctx = useContext(JobDraftContext);
  if (!ctx) throw new Error('useJobDraft must be used inside JobDraftProvider');
  return ctx;
}
