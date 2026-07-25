// embed-text — FR-PROF-4.
// Generates the pgvector embedding for a worker's service description so
// "my sink is leaking" can match a plumber semantically (FR-DISC-4).
// Ownership is enforced server-side: callers may only embed their own rows.

import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, embedText, jsonResponse, LlmUnavailableError } from "../_shared/llm.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;

  let serviceId: string;
  try {
    const body = await req.json();
    serviceId = String(body.service_id ?? "");
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (!serviceId) return jsonResponse({ error: "service_id required" }, 400);

  // RLS-scoped read: resolves only if the row belongs to the caller.
  const { data: service, error } = await ctx.supabase
    .from("service_descriptions")
    .select("id, user_id, title, description, trade_slug")
    .eq("id", serviceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (error) return jsonResponse({ error: "db_error" }, 500);
  if (!service) return jsonResponse({ error: "not_found" }, 404);

  try {
    const vector = await embedText(
      `${service.trade_slug}: ${service.title}. ${service.description}`,
    );

    const { error: updateError } = await ctx.admin
      .from("service_descriptions")
      .update({ embedding: vector })
      .eq("id", service.id);

    if (updateError) return jsonResponse({ error: "db_error" }, 500);
    return jsonResponse({ ok: true, dimensions: vector.length });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      // Non-fatal for the product: the profile still works, matching falls
      // back to trade/parish filters until embedding succeeds on a retry.
      return jsonResponse({ error: "embedding_unavailable", detail: err.attempts }, 503);
    }
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
