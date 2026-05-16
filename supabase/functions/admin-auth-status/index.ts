import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireInternalAdmin } from "../_shared/admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const adminAuth = await requireInternalAdmin(req);

  if (!adminAuth.ok) {
    return jsonResponse(
      {
        isAdmin: false,
        role: null,
        error: adminAuth.error,
      },
      adminAuth.status,
    );
  }

  return jsonResponse({
    isAdmin: true,
    role: adminAuth.role,
  });
});
