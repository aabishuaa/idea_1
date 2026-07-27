// BizBot — grounded Q&A about formalizing a business in Jamaica (FR-BIZ-4/5).
//
// Retrieval runs as Postgres full-text search over kb_chunks (search_kb), so
// this works with no embeddings and no Python service — only Supabase plus an
// LLM key. Answers are grounded in the retrieved passages and always cite
// them; when retrieval finds nothing the function says so rather than letting
// the model invent tax or registration rules (SR-9).
//
// Deterministic content — the checklist, required documents, fees — is NEVER
// generated here. That lives in checklist_items and is narrated by the app.

import { requireUser } from "../_shared/auth.ts";
import {
  chatComplete,
  corsHeaders,
  jsonResponse,
  LlmUnavailableError,
  type ChatMessage,
} from "../_shared/llm.ts";

interface Passage {
  content: string;
  title: string;
  topic: string;
  source_name: string;
  source_url: string;
  rank: number;
}

const SYSTEM_PROMPT = `You are BizBot, a friendly Jamaican business assistant inside the myB app.
You help independent skilled workers — plumbers, hairdressers, tutors, cooks, mechanics — understand how to make their business official in Jamaica.

Rules you must follow:
- Answer ONLY from the SOURCES provided. If the sources do not cover the question, say plainly that you don't have that information and suggest they check with the agency named, or ask about TRN, business name registration, NIS, income tax or GCT.
- Never invent fees, deadlines, thresholds or form numbers. If a number is not in the sources, do not state one.
- Cite the sources you used inline as [1], [2] matching their order.
- Write short, warm, plain English. Jamaican conversational tone is welcome; keep the tax facts precise.
- 120 words or fewer unless the user asks for detail. Use a short list when there are steps.
- You are not a lawyer or accountant; for complex situations suggest speaking with TAJ or the JBDC.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  let body: { question?: string; country?: string; parish?: string | null; history?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const question = (body.question ?? "").trim();
  if (!question) return jsonResponse({ error: "question is required" }, 400);
  const country = body.country ?? "JM";

  // ── Retrieve ──────────────────────────────────────────────────────────────
  const { data, error } = await caller.supabase.rpc("search_kb", {
    p_question: question,
    p_country: country,
    p_limit: 5,
  });

  if (error) {
    return jsonResponse({ error: "knowledge base unavailable", detail: error.message }, 503);
  }

  const passages = (data ?? []) as Passage[];

  if (passages.length === 0) {
    return jsonResponse({
      answer:
        "Mi nuh have information on that one yet. Mi can help with TRN, registering a business name, NIS, income tax, the Tax Compliance Certificate (TCC) and GCT — ask me about any of those. For anything else, Tax Administration Jamaica (TAJ) or the JBDC can guide you.",
      sources: [],
      grounded: false,
      provider: null,
    });
  }

  const sourcesBlock = passages
    .map((p, i) => `[${i + 1}] ${p.title} (${p.source_name || "official source"})\n${p.content}`)
    .join("\n\n");

  // Keep a little conversational context, but the sources are authoritative.
  const history = (body.history ?? []).slice(-6).filter(
    (turn) => turn.role === "user" || turn.role === "assistant",
  );

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: `SOURCES:\n${sourcesBlock}\n\nQUESTION: ${question}` },
  ];

  try {
    const { text, provider } = await chatComplete(messages, { temperature: 0.2 });
    return jsonResponse({
      answer: text.trim(),
      sources: passages.map((p) => ({
        title: p.title,
        source_name: p.source_name,
        source_url: p.source_url,
        similarity: Number(p.rank ?? 0),
      })),
      grounded: true,
      provider,
    });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      // Both providers down or out of quota: still return the source material
      // rather than nothing, so the user gets a usable answer.
      return jsonResponse({
        answer:
          `Mi can't reach the AI right now, but here is what the official guidance says:\n\n` +
          passages
            .slice(0, 2)
            .map((p, i) => `[${i + 1}] ${p.title}\n${p.content.slice(0, 400)}`)
            .join("\n\n"),
        sources: passages.map((p) => ({
          title: p.title,
          source_name: p.source_name,
          source_url: p.source_url,
          similarity: Number(p.rank ?? 0),
        })),
        grounded: true,
        provider: null,
      });
    }
    return jsonResponse({ error: "bizbot failed", detail: String(err) }, 500);
  }
});
