// Caller verification for edge functions: every request must carry a valid
// Supabase user JWT (SR-12 — no trust in client-side checks alone).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface CallerContext {
  userId: string;
  /** Client scoped to the caller (RLS applies). */
  supabase: SupabaseClient;
  /** Service-role client — server-side privileges. Use sparingly. */
  admin: SupabaseClient;
}

export async function requireUser(req: Request): Promise<CallerContext | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return { userId: data.user.id, supabase, admin };
}
