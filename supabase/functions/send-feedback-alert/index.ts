import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type FeedbackAlertPayload = {
  business_id: string;
  location_id: string;
  location_name?: string | null;
  sentiment?: string | null;
  comments?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  dashboard_url?: string | null;
  unsubscribe_url?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ALERTS_FROM_EMAIL = Deno.env.get("ALERTS_FROM_EMAIL") ?? "alerts@example.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: FeedbackAlertPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!payload.business_id || !payload.location_id) {
    return new Response("Missing business_id or location_id", { status: 400 });
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, owner_id, email_alerts_enabled")
    .eq("id", payload.business_id)
    .single();

  if (businessError || !business) {
    return new Response("Business not found", { status: 404 });
  }

  if (business.email_alerts_enabled === false) {
    return new Response("Alerts disabled", { status: 204 });
  }

  const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(
    business.owner_id,
  );

  if (ownerError || !owner?.user?.email) {
    return new Response("Owner email not found", { status: 404 });
  }

  if (!RESEND_API_KEY) {
    return new Response("Email provider not configured", { status: 500 });
  }

  const subject = payload.subject ?? "New feedback received";
  const textBody =
    payload.text ??
    `You received new feedback. View it here: ${payload.dashboard_url ?? ""}`.trim();
  const htmlBody =
    payload.html ??
    `<p>You received new feedback. <a href="${payload.dashboard_url ?? "#"}">View it here</a>.</p>`;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERTS_FROM_EMAIL,
      to: owner.user.email,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return new Response(`Email send failed: ${errorText}`, {
      status: resendResponse.status,
    });
  }

  return new Response("Email sent", { status: 200 });
});
