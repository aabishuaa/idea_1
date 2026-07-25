// keepwarm — SR-10.
// Pinged by .github/workflows/keepwarm.yml so the free-tier Supabase project
// never hits the 7-day inactivity auto-pause. Reads one config row so the
// database itself registers activity.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/llm.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { error } = await admin.from("app_config").select("key").limit(1);
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  return jsonResponse({ ok: true, at: new Date().toISOString() });
});
