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
}

const TRADES = [
  "plumbing", "electrical", "carpentry", "painting", "masonry", "tiling",
  "welding", "mechanics", "appliance-repair", "landscaping",
  "ac-refrigeration", "roofing",
];

const PARISHES = [
  "Kingston", "St. Andrew", "St. Thomas", "Portland", "St. Mary", "St. Ann",
  "Trelawny", "St. James", "Hanover", "Westmoreland", "St. Elizabeth",
  "Manchester", "Clarendon", "St. Catherine",
];

const SYSTEM_PROMPT = `You extract structured job intent from a customer's plain-language description of a job in Jamaica. Descriptions may be in Jamaican Patois.
Respond with ONLY a JSON object of this exact shape:
{"job_type": <one of ${JSON.stringify(TRADES)} or null>,
 "location": <one of ${JSON.stringify(PARISHES)} or null>,
 "urgency": <"low"|"normal"|"high"|"emergency">,
 "budget": {"min_jmd": <number|null>, "max_jmd": <number|null>}}
Rules: choose the closest job_type; map towns to their parish (e.g. Spanish Town → "St. Catherine", Montego Bay → "St. James", Half Way Tree → "St. Andrew"); "right now"/"water flooding" style wording is high or emergency urgency; budgets are Jamaican dollars. Use null when genuinely unknown. No prose, no markdown.`;

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

  try {
    const { text, provider } = await chatComplete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
      { jsonMode: true, temperature: 0 },
    );

    let intent: ExtractedIntent;
    try {
      const raw = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
      intent = {
        job_type: TRADES.includes(raw.job_type) ? raw.job_type : null,
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
