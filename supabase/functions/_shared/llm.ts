// Shared LLM client for edge functions.
// SR-11 / CLAUDE.md §6: every LLM call is wrapped with primary→secondary
// failover (Gemini → Groq) and explicit 429/timeout handling. Both providers
// expose OpenAI-compatible chat completions, so one code path serves both.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Provider {
  name: string;
  url: string;
  model: string;
  apiKey: string | undefined;
}

const TIMEOUT_MS = 25_000;

function providers(): Provider[] {
  return [
    {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-2.5-flash",
      apiKey: Deno.env.get("GEMINI_API_KEY"),
    },
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-versatile",
      apiKey: Deno.env.get("GROQ_API_KEY"),
    },
  ];
}

export class LlmUnavailableError extends Error {
  constructor(public attempts: string[]) {
    super(`All LLM providers failed: ${attempts.join("; ")}`);
  }
}

/**
 * Chat completion with failover. Returns the assistant text.
 * `jsonMode` asks the provider for a JSON object response.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: { jsonMode?: boolean; temperature?: number } = {},
): Promise<{ text: string; provider: string }> {
  const attempts: string[] = [];

  for (const p of providers()) {
    if (!p.apiKey) {
      attempts.push(`${p.name}: no API key configured`);
      continue;
    }
    try {
      const res = await fetch(p.url, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({
          model: p.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (res.status === 429) {
        attempts.push(`${p.name}: rate limited (429)`);
        continue; // fail over
      }
      if (!res.ok) {
        attempts.push(`${p.name}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const text: string | undefined = data?.choices?.[0]?.message?.content;
      if (!text) {
        attempts.push(`${p.name}: empty response`);
        continue;
      }
      return { text, provider: p.name };
    } catch (err) {
      const kind = err instanceof DOMException && err.name === "TimeoutError"
        ? "timeout"
        : String(err);
      attempts.push(`${p.name}: ${kind}`);
    }
  }

  throw new LlmUnavailableError(attempts);
}

/**
 * Text embedding via Gemini (text-embedding-004, 768 dims — matches the
 * vector(768) columns). No Groq fallback: Groq has no embeddings endpoint,
 * so callers must handle LlmUnavailableError by retrying later.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new LlmUnavailableError(["gemini: no API key configured"]);

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/embeddings",
    {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: "text-embedding-004", input: text }),
    },
  );

  if (!res.ok) {
    throw new LlmUnavailableError([`gemini embeddings: HTTP ${res.status}`]);
  }
  const data = await res.json();
  const vec: number[] | undefined = data?.data?.[0]?.embedding;
  if (!vec) throw new LlmUnavailableError(["gemini embeddings: empty response"]);
  return vec;
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
