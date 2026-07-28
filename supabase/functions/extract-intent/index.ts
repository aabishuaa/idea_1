// extract-intent — FR-DISC-2.
// Natural-language job description → structured {job_type, location, urgency,
// budget}. The LLM does LANGUAGE only; ranking stays in SQL (match_workers).

import { requireUser } from "../_shared/auth.ts";
import {
  chatComplete,
  corsHeaders,
  embedText,
  jsonResponse,
  LlmUnavailableError,
} from "../_shared/llm.ts";

interface ExtractedIntent {
  job_type: string | null;
  location: string | null;
  urgency: "low" | "normal" | "high" | "emergency";
  budget: { min_jmd: number | null; max_jmd: number | null };
  /** A short human title for the booking — NOT a copy of the description. */
  title: string | null;
}

// The taxonomy is data, not code (migration 0014 opened it to 48 trades across
// the whole informal economy). Hardcoding twelve building trades here meant a
// tutor or a hairdresser could never be classified — the LLM was only ever
// offered plumbers and electricians.
async function loadTrades(): Promise<string[]> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return FALLBACK_TRADES;
    const response = await fetch(`${url}/rest/v1/trades?select=slug`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return FALLBACK_TRADES;
    const rows = await response.json() as { slug: string }[];
    const slugs = rows.map((row) => row.slug).filter(Boolean);
    return slugs.length > 0 ? slugs : FALLBACK_TRADES;
  } catch {
    return FALLBACK_TRADES;
  }
}

const FALLBACK_TRADES = [
  "plumbing", "electrical", "carpentry", "painting", "masonry", "tiling",
  "welding", "mechanics", "appliance-repair", "landscaping",
  "ac-refrigeration", "roofing",
];

const PARISHES = [
  "Kingston", "St. Andrew", "St. Thomas", "Portland", "St. Mary", "St. Ann",
  "Trelawny", "St. James", "Hanover", "Westmoreland", "St. Elizabeth",
  "Manchester", "Clarendon", "St. Catherine",
];

function systemPrompt(trades: string[]): string {
  return `You extract structured job intent from a customer's plain-language description of a job in Jamaica. Descriptions may be in Jamaican Patois.
Respond with ONLY a JSON object of this exact shape:
{"job_type": <one of ${JSON.stringify(trades)} or null>,
 "location": <one of ${JSON.stringify(PARISHES)} or null>,
 "urgency": <"low"|"normal"|"high"|"emergency">,
 "budget": {"min_jmd": <number|null>, "max_jmd": <number|null>},
 "title": <a short title, 3 to 6 words, Title Case>}
Rules: choose the closest job_type; map towns to their parish (e.g. Spanish Town → "St. Catherine", Montego Bay → "St. James", Half Way Tree → "St. Andrew"); "right now"/"water flooding" style wording is high or emergency urgency; budgets are Jamaican dollars. Use null when genuinely unknown.
The title must NAME THE JOB, not repeat the description: "Mi pipe under di sink a leak, need it fix quick" → "Kitchen Sink Leak Repair"; "need someone fi teach mi daughter maths" → "Maths Tutoring". Never copy the sentence back. No prose, no markdown.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;

  let description: string;
  try {
    const body = await req.json();
    description = String(body.description ?? "").trim();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (description.length < 3 || description.length > 2000) {
    return jsonResponse({ error: "description must be 3–2000 characters" }, 400);
  }

  const trades = await loadTrades();

  try {
    const { text, provider } = await chatComplete(
      [
        { role: "system", content: systemPrompt(trades) },
        { role: "user", content: description },
      ],
      { jsonMode: true, temperature: 0 },
    );

    let intent: ExtractedIntent;
    try {
      const raw = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
      // A "title" that is just the description echoed back is worse than no
      // title — the app has a better deterministic fallback.
      const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
      const echoed =
        rawTitle.toLowerCase() === description.toLowerCase() ||
        description.toLowerCase().startsWith(rawTitle.toLowerCase().slice(0, 24));

      intent = {
        title: rawTitle.length >= 3 && rawTitle.length <= 60 && !echoed ? rawTitle : null,
        job_type: trades.includes(raw.job_type) ? raw.job_type : null,
        location: PARISHES.includes(raw.location) ? raw.location : null,
        urgency: ["low", "normal", "high", "emergency"].includes(raw.urgency)
          ? raw.urgency
          : "normal",
        budget: {
          min_jmd: typeof raw?.budget?.min_jmd === "number" ? raw.budget.min_jmd : null,
          max_jmd: typeof raw?.budget?.max_jmd === "number" ? raw.budget.max_jmd : null,
        },
      };
    } catch {
      return jsonResponse({ error: "llm_parse_failed" }, 502);
    }

    // Embed the description so the app can pass it straight to match_workers
    // for semantic ranking (FR-DISC-4). Embedding failure is non-fatal —
    // matching falls back to trade/parish filters.
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(description);
    } catch {
      embedding = null;
    }

    return jsonResponse({ intent, embedding, provider });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      return jsonResponse({ error: "llm_unavailable", detail: err.attempts }, 503);
    }
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
