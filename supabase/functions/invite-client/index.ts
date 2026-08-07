// Edge Function: invita a un cliente por email usando el email nativo de
// Supabase Auth (inviteUserByEmail). Solo la puede llamar el dueño (admin).
// Deploy: supabase functions deploy invite-client
// Secreto opcional: supabase secrets set SITE_URL=https://app-barber.pages.dev
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: me } = await caller.rpc("me");
    if (!me || me.role !== "admin") return json({ error: "forbidden" }, 403);

    const { email } = await req.json();
    if (!email) return json({ error: "email required" }, 400);
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const redirectTo = Deno.env.get("SITE_URL") || undefined;
    const { error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
