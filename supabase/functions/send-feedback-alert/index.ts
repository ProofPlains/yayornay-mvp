import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
const ALERTS_FROM_EMAIL =
  Deno.env.get("ALERTS_FROM_EMAIL") ?? "alerts@alerts.flashfeedback.co.uk";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let payload: FeedbackAlertPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  if (!payload.business_id || !payload.location_id) {
    return new Response("Missing business_id or location_id", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, owner_id, email_alerts_enabled")
    .eq("id", payload.business_id)
    .single();

  if (businessError || !business) {
    return new Response("Business not found", { status: 404, headers: corsHeaders });
  }

  if (business.email_alerts_enabled === false) {
    return new Response("Alerts disabled", { status: 204, headers: corsHeaders });
  }

  const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(
    business.owner_id,
  );

  if (ownerError || !owner?.user?.email) {
    return new Response("Owner email not found", { status: 404, headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return new Response("Email provider not configured", {
      status: 500,
      headers: corsHeaders,
    });
  }

  const subject = payload.subject ?? "New feedback received";
  const textBody =
    payload.text ??
    `You received new feedback. View it here: ${payload.dashboard_url ?? ""}`.trim();
  const dashboardUrl = payload.dashboard_url ?? "#";
  const unsubscribeUrl = payload.unsubscribe_url ?? "#";
  const previewText = "You received new feedback. View it on your dashboard.";
  const htmlBody =
    payload.html ??
    `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>New feedback received</title>
        </head>
        <body style="margin:0; padding:0; background-color:#f3f4f6;">
          <div style="display:none; max-height:0; overflow:hidden; color:transparent; opacity:0;">
            ${previewText}
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center" style="padding:32px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08);">
                  <tr>
                    <td style="padding:28px 32px 12px;">
                      <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:14px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#7c3aed;">
                        Flash Feedback
                      </div>
                      <h1 style="margin:12px 0 8px; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:26px; line-height:1.25; color:#0f172a;">
                        You received new feedback
                      </h1>
                      <p style="margin:0; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:16px; line-height:1.6; color:#475569;">
                        A customer just shared feedback for your business. Jump into your dashboard to review it and respond quickly.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 32px 32px;">
                      <a href="${dashboardUrl}" style="display:inline-block; padding:12px 20px; background:#7c3aed; color:#ffffff; text-decoration:none; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:15px; font-weight:600; border-radius:999px;">
                        View feedback
                      </a>
                      <p style="margin:16px 0 0; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:13px; color:#94a3b8;">
                        If the button doesn’t work, copy this link into your browser:<br />
                        <a href="${dashboardUrl}" style="color:#7c3aed; word-break:break-all;">${dashboardUrl}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 24px; border-top:1px solid #e2e8f0;">
                      <p style="margin:16px 0 4px; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:12px; color:#94a3b8;">
                        You’re receiving this because email alerts are enabled on your Flash Feedback account.
                      </p>
                      <a href="${unsubscribeUrl}" style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:12px; color:#64748b; text-decoration:underline;">
                        Unsubscribe from feedback alerts
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:12px; color:#94a3b8;">
                  © ${new Date().getFullYear()} Flash Feedback
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

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
      headers: corsHeaders,
    });
  }

  return new Response("Email sent", { status: 200, headers: corsHeaders });
});
