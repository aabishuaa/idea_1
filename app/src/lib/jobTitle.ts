/**
 * A short, human title for a booking.
 *
 * The old behaviour was `description.slice(0, 60)`, which is not a title — it
 * put the same sentence on the form and on the booking card, in Patois, cut
 * mid-word. A booking list needs something scannable.
 *
 * Order of preference:
 *   1. What the LLM named it (rejected upstream if it echoed the description).
 *   2. A deterministic label built from the trade and parish.
 *   3. The first clause of the description with the "I need someone to"
 *      scaffolding stripped — last resort only.
 *
 * Deterministic on purpose: a title must exist with no LLM key, no network,
 * and no cold-start wait.
 */

/**
 * Openers that mean "I am asking for help", which never belong in a title.
 * Applied repeatedly, because they stack: "mi need someone fi …" is four of
 * these in a row, and a single alternation only ever strips the first.
 */
const OPENERS = [
  /^(i|mi|me)\s+/i,
  /^(need|want|require|looking\s+for|searching\s+for|seeking)\s+/i,
  /^(someone|somebody|anyone|a\s+person)\s+/i,
  /^(to|fi|that\s+can|who\s+can|dat\s+can)\s+/i,
  /^(please|pls|hi|hello)\s+/i,
];

/** A title should not end on a dangling word. */
const TRAILING = new Set([
  'a', 'an', 'the', 'for', 'on', 'in', 'at', 'to', 'fi', 'my', 'mi', 'di', 'and',
  'with', 'of', 'is', 'it', 'that', 'dat', 'so', 'but', 'me', 'him', 'her',
]);

const MAX_WORDS = 6;

export function suggestJobTitle(input: {
  llmTitle: string | null;
  description: string;
  tradeLabel: string | null;
  parish: string | null;
}): string {
  const { llmTitle, description, tradeLabel, parish } = input;

  if (llmTitle && llmTitle.trim().length >= 3) return llmTitle.trim();

  if (tradeLabel) {
    return parish ? `${tradeLabel} job in ${parish}` : `${tradeLabel} job`;
  }

  // Peel the request scaffolding off the front until nothing more matches.
  let cleaned = description.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const opener of OPENERS) {
      const next = cleaned.replace(opener, '');
      if (next !== cleaned) {
        cleaned = next.trimStart();
        changed = true;
      }
    }
  }

  // First clause, so a title never runs into a second thought.
  const clause = (cleaned.split(/[.,;!?\n]/)[0] ?? cleaned).trim();
  const words = clause.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  while (words.length > 0 && TRAILING.has((words[words.length - 1] ?? '').toLowerCase())) {
    words.pop();
  }

  const title = words.join(' ');
  if (title.length < 3) return 'New job request';
  return title.charAt(0).toUpperCase() + title.slice(1);
}
