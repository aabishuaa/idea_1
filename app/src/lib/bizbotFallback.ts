import { supabase } from './supabase';
import type { RagAnswer, RagSource } from './ai';

interface KbPassage {
  content: string;
  title: string;
  topic: string;
  source_name: string;
  source_url: string;
  rank: number;
}

/**
 * BizBot without the edge function and without an LLM key.
 *
 * The important realisation: retrieval is plain Postgres full-text search over
 * kb_chunks (`search_kb`, migration 0015). It needs no embeddings, no Gemini,
 * no Groq and no deployed function — the app can call the RPC itself. So the
 * WORST case for BizBot is not "it is broken", it is "it quotes the official
 * guidance at you instead of paraphrasing it", which is still a real answer
 * and arguably a more trustworthy one.
 *
 * That matters beyond convenience: BizBot must never invent a tax rule
 * (CLAUDE.md §4.3). Serving the source text verbatim cannot violate that.
 *
 * Marked `grounded: true` and `provider: 'sources'` so the UI can say plainly
 * that these are quoted passages rather than a written answer.
 */
export async function answerFromKnowledgeBase(
  question: string,
  country = 'JM',
): Promise<RagAnswer> {
  const { data, error } = await supabase.rpc('search_kb', {
    p_question: question,
    p_country: country,
    p_limit: 4,
  });

  if (error) {
    throw new Error(`knowledge base unavailable: ${error.message}`);
  }

  const passages = (data as KbPassage[] | null) ?? [];

  if (passages.length === 0) {
    return {
      answer:
        "Mi nuh have information on that one yet. Mi can help with the TRN, registering a business name, NIS, income tax, the Tax Compliance Certificate and GCT — try asking about any of those. For anything else, Tax Administration Jamaica (TAJ) or the JBDC can guide you.",
      sources: [],
      grounded: false,
      provider: 'sources',
    };
  }

  // Quote, do not summarise. Two passages is enough to answer without turning
  // the reply into a wall of text.
  const body = passages
    .slice(0, 2)
    .map((passage, index) => `[${index + 1}] ${passage.title}\n${passage.content}`)
    .join('\n\n');

  const sources: RagSource[] = passages.map((passage) => ({
    title: passage.title,
    source_name: passage.source_name,
    source_url: passage.source_url,
    similarity: Number(passage.rank ?? 0),
  }));

  return {
    answer: `Here's exactly what the official guidance says:\n\n${body}`,
    sources,
    grounded: true,
    provider: 'sources',
  };
}
