import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type Payload = {
  location_id?: string;
  sentiment?: string;
  comments?: string | null;
  reply_requested?: boolean;
  customer_email?: string | null;
  device_key?: string | null;
  client_context?: Record<string, unknown> | null;
  dashboard_url?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "your email address";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(3, Math.min(6, local.length - 1)))}@${domain}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Payload;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const locationId = String(payload.location_id || "").trim();
  const sentiment = String(payload.sentiment || "").trim();
  const allowedSentiments = ["very-happy", "happy", "neutral", "sad", "very-sad"];
  if (!locationId || !allowedSentiments.includes(sentiment)) return json({ error: "Choose a valid rating" }, 400);

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id,name,is_active,business_id")
    .eq("id", locationId)
    .maybeSingle();
  if (locationError) {
    console.error("location lookup failed", locationError);
    return json({ error: "Could not load this location" }, 500);
  }
  if (!location) return json({ error: "Location not found" }, 404);
  if (location.is_active === false) return json({ error: "This location is not accepting feedback" }, 409);

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id,name,pricing_tier")
    .eq("id", location.business_id)
    .maybeSingle();
  if (businessError) {
    console.error("business lookup failed", businessError);
    return json({ error: "Could not load this business" }, 500);
  }
  if (!business) return json({ error: "Business not found" }, 404);
  const eligible = business?.pricing_tier === "growth" || business?.pricing_tier === "pro";
  const replyRequested = payload.reply_requested === true;
  const customerEmail = replyRequested ? normalizeEmail(payload.customer_email) : "";
  if (replyRequested && !eligible) return json({ error: "Reply requests are not available for this location" }, 403);
  if (replyRequested && !validEmail(customerEmail)) return json({ error: "Enter a valid email address" }, 400);

  const comments = String(payload.comments || "").trim().slice(0, 500) || null;
  const deviceKey = String(payload.device_key || "").trim().slice(0, 200) || null;
  const clientContext = payload.client_context && typeof payload.client_context === "object" ? payload.client_context : {};
  const { data: feedback, error: insertError } = await supabase
    .from("feedback")
    .insert({
      business_id: location.business_id,
      location_id: location.id,
      sentiment,
      comments,
      device_key: deviceKey,
      client_context: clientContext,
      reply_requested: replyRequested,
      customer_email: replyRequested ? customerEmail : null,
      reply_status: replyRequested ? "requested" : null,
    })
    .select("id,submitted_at")
    .single();
  if (insertError || !feedback) {
    console.error("feedback insert failed", insertError);
    return json({ error: "Could not save feedback" }, 500);
  }

  if (replyRequested) {
    await supabase.from("analytics_events").insert({
      business_id: location.business_id, location_id: location.id,
      event_type: "reply_request_saved", source: "customer_qr",
      metadata: { feedback_id: feedback.id, tier: business?.pricing_tier, has_comment: Boolean(comments) },
      idempotency_key: `reply-request-saved:${feedback.id}`,
    });
  }

  // Alert delivery is deliberately non-blocking from the customer's perspective.
  const alertDelivery = fetch(`${SUPABASE_URL}/functions/v1/send-feedback-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ feedback_id: feedback.id, dashboard_url: payload.dashboard_url || null }),
    }).catch((error) => console.error("feedback alert dispatch failed", error));
  const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(alertDelivery);
  else await alertDelivery;

  return json({
    feedback_id: feedback.id,
    submitted_at: feedback.submitted_at,
    reply_requested: replyRequested,
    masked_email: replyRequested ? maskEmail(customerEmail) : null,
  }, 201);
});
