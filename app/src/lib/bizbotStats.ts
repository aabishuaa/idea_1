import { formatJmd } from './format';
import { supabase } from './supabase';
import type { RagAnswer } from './ai';

export interface BusinessStats {
  jobs_booked_this_month: number;
  jobs_worked_this_month: number;
  jobs_completed_all_time: number;
  earned_this_month_jmd: number;
  earned_all_time_jmd: number;
  spent_this_month_jmd: number;
  rating_avg: number;
  rating_count: number;
  reputation: number;
  active_jobs: number;
  pending_requests: number;
  formalization_done: number;
  formalization_total: number;
  identity_verified: boolean;
  member_since: string;
}

/**
 * Questions BizBot answers about YOU rather than about Jamaican tax law.
 *
 * Deliberately a keyword test rather than an LLM classification: getting this
 * wrong in the "no" direction just means a normal RAG answer, and getting it
 * wrong in the "yes" direction means quoting real numbers at somebody who
 * asked something else. Both are recoverable; a hallucinated income figure is
 * not.
 */
const PERSONAL = /\b(my|mi|i|me)\b.*\b(job|jobs|earn|earning|earned|made|money|income|rating|review|reputation|spent|spend|booking|bookings|progress|pathway|profile|stats?|business)\b/i;
const ALSO_PERSONAL =
  /\b(how (many|much) (jobs|job|money|did i|have i)|this month|so far|to date|my numbers|how am i doing)\b/i;

export function isPersonalQuestion(question: string): boolean {
  return PERSONAL.test(question) || ALSO_PERSONAL.test(question);
}

export async function fetchBusinessStats(): Promise<BusinessStats | null> {
  const { data, error } = await supabase.rpc('get_my_business_stats');
  if (error) return null;
  const rows = data as BusinessStats[] | null;
  return rows?.[0] ?? null;
}

/**
 * Answers a question about the user's own activity, from the database.
 *
 * NOT routed through the LLM, ever. A count of your jobs or a total of your
 * earnings either matches the database exactly or the app is lying to somebody
 * about their own income — which is the one thing a product built to be
 * "alternative credit data" cannot do (CLAUDE.md §4.3: LLMs are for language,
 * not decisions, and never for numbers that must be right).
 *
 * Returns null when the question does not actually name anything we track, so
 * the caller falls through to normal retrieval.
 */
export function answerFromStats(question: string, stats: BusinessStats): RagAnswer | null {
  const q = question.toLowerCase();
  const lines: string[] = [];

  const asks = (...terms: string[]) => terms.some((term) => q.includes(term));

  if (asks('book', 'hire', 'hired', 'spent', 'spend')) {
    lines.push(
      `You booked ${stats.jobs_booked_this_month} job${stats.jobs_booked_this_month === 1 ? '' : 's'} this month.`,
    );
    if (Number(stats.spent_this_month_jmd) > 0) {
      lines.push(`You've spent ${formatJmd(stats.spent_this_month_jmd)} on completed work this month.`);
    }
  }

  if (asks('earn', 'earned', 'made', 'money', 'income', 'paid')) {
    lines.push(
      `You've earned ${formatJmd(stats.earned_this_month_jmd)} this month, and ${formatJmd(
        stats.earned_all_time_jmd,
      )} on myB all together.`,
    );
  }

  if (asks('job', 'work', 'complete', 'finished')) {
    lines.push(
      `You've completed ${stats.jobs_completed_all_time} job${stats.jobs_completed_all_time === 1 ? '' : 's'} in total, and worked ${stats.jobs_worked_this_month} this month.`,
    );
  }

  if (asks('rating', 'review', 'star', 'reputation', 'score')) {
    lines.push(
      stats.rating_count > 0
        ? `Your rating is ${Number(stats.rating_avg).toFixed(1)}★ from ${stats.rating_count} review${stats.rating_count === 1 ? '' : 's'}, and your reputation score is ${Math.round(Number(stats.reputation))} out of 100.`
        : 'You have no reviews yet — your rating starts once a customer reviews a completed job.',
    );
  }

  if (asks('pathway', 'formal', 'register', 'progress', 'level')) {
    lines.push(
      `On your formalization pathway you've completed ${stats.formalization_done} of ${stats.formalization_total} steps.`,
    );
  }

  if (asks('pending', 'waiting', 'request')) {
    lines.push(
      stats.pending_requests > 0
        ? `You have ${stats.pending_requests} job request${stats.pending_requests === 1 ? '' : 's'} waiting on your answer.`
        : 'Nothing is waiting on your answer right now.',
    );
  }

  // Nothing matched a stat we actually hold — let retrieval handle it.
  if (lines.length === 0) return null;

  if (stats.active_jobs > 0) {
    lines.push(
      `You also have ${stats.active_jobs} job${stats.active_jobs === 1 ? '' : 's'} on the go.`,
    );
  }

  return {
    answer: lines.join('\n\n'),
    sources: [],
    grounded: true,
    // Labelled so the UI can say these came from the user's own record.
    provider: 'your-record',
  };
}
