import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const unauthorized = (message = "Unauthorized") =>
  new Response(JSON.stringify({ error: message }), { status: 401, headers: jsonHeaders });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return unauthorized("Missing or invalid authorization header");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing backend env vars");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    // Validate the user's JWT
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      return unauthorized();
    }

    const userId = claimsData.claims.sub;

    // Admin client for deletion
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Best-effort cleanup of user-owned rows
    const { data: convs, error: convErr } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", userId);

    if (convErr) {
      console.error("Failed to list conversations:", convErr);
    }

    const convIds = (convs || []).map((c: any) => c.id).filter(Boolean);

    if (convIds.length > 0) {
      const { error: msgErr } = await admin.from("messages").delete().in("conversation_id", convIds);
      if (msgErr) console.error("Failed to delete messages:", msgErr);
    }

    const deletions = await Promise.all([
      admin.from("conversations").delete().eq("user_id", userId),
      admin.from("tasks").delete().eq("user_id", userId),
      admin.from("voice_commands").delete().eq("user_id", userId),
      admin.from("settings").delete().eq("user_id", userId),
      admin.from("profiles").delete().eq("id", userId),
    ]);

    deletions.forEach((res, idx) => {
      if (res.error) console.error(`Cleanup delete failed (${idx}):`, res.error);
    });

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error("Failed to delete user:", deleteUserError);
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("delete-account error:", error);
    return new Response(JSON.stringify({ error: "Failed to delete account" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
