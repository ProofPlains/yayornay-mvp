import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type QrOrderPayload = {
  business_id: string;
  business_name?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  location_id: string;
  location_name?: string | null;
  sign_url?: string | null;
  quantity: number;
  delivery_contact: string;
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  postcode: string;
  country: string;
  notes?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ALERTS_FROM_EMAIL = Deno.env.get("ALERTS_FROM_EMAIL") ?? "alerts@example.com";
const QR_ORDER_TO_EMAIL = Deno.env.get("QR_ORDER_TO_EMAIL") ?? "contact@flashfeedback.co.uk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function plainAddress(payload: QrOrderPayload) {
  return [
    payload.delivery_contact,
    payload.address_line_1,
    payload.address_line_2,
    payload.city,
    payload.postcode,
    payload.country,
  ].filter(Boolean).join("\n");
}

function htmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let payload: QrOrderPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  if (
    !payload.business_id ||
    !payload.location_id ||
    !payload.delivery_contact ||
    !payload.address_line_1 ||
    !payload.city ||
    !payload.postcode ||
    !["United Kingdom", "South Africa"].includes(payload.country) ||
    !Number.isFinite(payload.quantity) ||
    payload.quantity < 1 ||
    payload.quantity > 100
  ) {
    return new Response("Missing or invalid order details", { status: 400, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id,name,owner_id,owner_name")
    .eq("id", payload.business_id)
    .single();

  if (businessError || !business) {
    return new Response("Business not found", { status: 404, headers: corsHeaders });
  }

  if (business.owner_id !== userData.user.id) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id,name,business_id")
    .eq("id", payload.location_id)
    .single();

  if (locationError || !location || location.business_id !== payload.business_id) {
    return new Response("Location not found", { status: 404, headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return new Response("Email provider not configured", { status: 500, headers: corsHeaders });
  }

  const businessName = payload.business_name || business.name || "Unknown business";
  const ownerName = payload.owner_name || business.owner_name || userData.user.email || "Unknown owner";
  const ownerEmail = payload.owner_email || userData.user.email || "Unknown email";
  const locationName = payload.location_name || location.name || "Unknown location";
  const subject = `${payload.country}: New QR Sign Delivery Order - ${businessName} - ${locationName}`;
  const address = plainAddress(payload);
  const notes = payload.notes?.trim() || "None";

  const textBody = [
    "New QR sign delivery order",
    "",
    `Business: ${businessName}`,
    `Owner: ${ownerName}`,
    `Owner email: ${ownerEmail}`,
    `Business ID: ${payload.business_id}`,
    "",
    `Location: ${locationName}`,
    `Location ID: ${payload.location_id}`,
    `QR sign URL: ${payload.sign_url || ""}`,
    "",
    `Quantity: ${payload.quantity}`,
    "",
    "Delivery address:",
    address,
    "",
    `Notes: ${notes}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family:Inter,system-ui,sans-serif; font-size:16px; color:#0b1020;">
      <h2 style="margin:0 0 16px 0;">New QR sign delivery order</h2>
      <p><strong>Business:</strong> ${htmlEscape(businessName)}</p>
      <p><strong>Owner:</strong> ${htmlEscape(ownerName)}<br><strong>Owner email:</strong> ${htmlEscape(ownerEmail)}</p>
      <p><strong>Business ID:</strong> ${htmlEscape(payload.business_id)}</p>
      <hr>
      <p><strong>Location:</strong> ${htmlEscape(locationName)}<br><strong>Location ID:</strong> ${htmlEscape(payload.location_id)}</p>
      <p><strong>QR sign URL:</strong> <a href="${htmlEscape(payload.sign_url)}">${htmlEscape(payload.sign_url)}</a></p>
      <p><strong>Quantity:</strong> ${htmlEscape(payload.quantity)}</p>
      <p><strong>Delivery address:</strong><br>${htmlEscape(address).replaceAll("\n", "<br>")}</p>
      <p><strong>Notes:</strong> ${htmlEscape(notes)}</p>
    </div>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERTS_FROM_EMAIL,
      to: QR_ORDER_TO_EMAIL,
      reply_to: ownerEmail.includes("@") ? ownerEmail : undefined,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return new Response(`Email send failed: ${errorText}`, {
      status: resendResponse.status,
      headers: corsHeaders,
    });
  }

  return new Response("Order email sent", { status: 200, headers: corsHeaders });
});
