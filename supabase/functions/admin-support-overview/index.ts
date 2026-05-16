import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getAuthorizationHeader(req: Request): string | null {
  const authorization = req.headers.get("Authorization");
  return authorization?.startsWith("Bearer ") ? authorization : null;
}

async function requireInternalAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || (!anonKey && !serviceRoleKey)) {
    return {
      ok: false,
      status: 500,
      role: null,
      error: "Supabase environment is not configured",
    };
  }

  const authorization = getAuthorizationHeader(req);
  if (!authorization) {
    return {
      ok: false,
      status: 401,
      role: null,
      error: "Missing bearer token",
    };
  }

  const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data: isAdmin, error: isAdminError } = await userClient.rpc("is_internal_admin");
  if (isAdminError) {
    console.error("is_internal_admin RPC failed", isAdminError);
    return {
      ok: false,
      status: 500,
      role: null,
      error: "Unable to verify admin access",
    };
  }

  if (isAdmin !== true) {
    return {
      ok: false,
      status: 403,
      role: null,
      error: "Internal admin access required",
    };
  }

  const { data: role, error: roleError } = await userClient.rpc("current_internal_admin_role");
  if (roleError) {
    console.error("current_internal_admin_role RPC failed", roleError);
    return {
      ok: false,
      status: 500,
      role: null,
      error: "Unable to resolve admin role",
    };
  }

  return {
    ok: true,
    role: typeof role === "string" ? role : null,
  };
}

function latestDate(existing: string | null, candidate: string | null) {
  if (!candidate) return existing;
  if (!existing) return candidate;
  return new Date(candidate).getTime() > new Date(existing).getTime() ? candidate : existing;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const adminAuth = await requireInternalAdmin(req);
    if (!adminAuth.ok) {
      return jsonResponse(
        { isAdmin: false, role: null, error: adminAuth.error },
        adminAuth.status,
      );
    }

    if (adminAuth.role !== "superuser") {
      return jsonResponse(
        { isAdmin: true, role: adminAuth.role, error: "Superuser access required" },
        403,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase service configuration" }, 500);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const [businessesResult, locationsResult, feedbackResult] = await Promise.all([
      serviceClient
        .from("businesses")
        .select("id,name,owner_id,owner_name,created_at,industry,business_type,timezone,email_alerts_enabled")
        .order("created_at", { ascending: false })
        .limit(200),
      serviceClient
        .from("locations")
        .select("id,business_id,name,is_active,created_at")
        .order("created_at", { ascending: true }),
      serviceClient
        .from("feedback")
        .select("id,business_id,location_id,sentiment,comments,submitted_at")
        .order("submitted_at", { ascending: false })
        .limit(1000),
    ]);

    if (businessesResult.error) throw businessesResult.error;
    if (locationsResult.error) throw locationsResult.error;
    if (feedbackResult.error) throw feedbackResult.error;

    const businesses = businessesResult.data || [];
    const locations = locationsResult.data || [];
    const feedback = feedbackResult.data || [];

    const locationsByBusiness = new Map<string, any[]>();
    const locationToBusiness = new Map<string, string>();
    for (const location of locations) {
      if (!location.business_id) continue;
      locationToBusiness.set(location.id, location.business_id);
      const current = locationsByBusiness.get(location.business_id) || [];
      current.push(location);
      locationsByBusiness.set(location.business_id, current);
    }

    const feedbackByBusiness = new Map<string, any[]>();
    const feedbackByLocation = new Map<string, any[]>();
    for (const item of feedback) {
      const businessId = item.business_id || (item.location_id ? locationToBusiness.get(item.location_id) : null);
      if (!businessId) continue;

      const businessFeedback = feedbackByBusiness.get(businessId) || [];
      businessFeedback.push(item);
      feedbackByBusiness.set(businessId, businessFeedback);

      if (item.location_id) {
        const locationFeedback = feedbackByLocation.get(item.location_id) || [];
        locationFeedback.push(item);
        feedbackByLocation.set(item.location_id, locationFeedback);
      }
    }

    const overview = businesses.map((business) => {
      const businessLocations = locationsByBusiness.get(business.id) || [];
      const businessFeedback = feedbackByBusiness.get(business.id) || [];

      const locationSummaries = businessLocations.map((location) => {
        const locationFeedback = feedbackByLocation.get(location.id) || [];
        const latestFeedbackAt = locationFeedback.reduce(
          (latest, item) => latestDate(latest, item.submitted_at),
          null as string | null,
        );
        return {
          id: location.id,
          name: location.name,
          isActive: location.is_active !== false,
          createdAt: location.created_at,
          feedbackCount: locationFeedback.length,
          latestFeedbackAt,
        };
      });

      const latestFeedbackAt = businessFeedback.reduce(
        (latest, item) => latestDate(latest, item.submitted_at),
        null as string | null,
      );

      const locationNames = new Map(locationSummaries.map((location) => [location.id, location.name]));

      return {
        id: business.id,
        name: business.name,
        ownerName: business.owner_name,
        ownerUserId: business.owner_id,
        createdAt: business.created_at,
        industry: business.industry,
        businessType: business.business_type,
        timezone: business.timezone,
        emailAlertsEnabled: business.email_alerts_enabled !== false,
        locationCount: businessLocations.length,
        activeLocationCount: businessLocations.filter((location) => location.is_active !== false).length,
        inactiveLocationCount: businessLocations.filter((location) => location.is_active === false).length,
        feedbackCount: businessFeedback.length,
        latestFeedbackAt,
        locations: locationSummaries,
        recentFeedback: businessFeedback.slice(0, 5).map((item) => ({
          id: item.id,
          locationId: item.location_id,
          locationName: item.location_id ? locationNames.get(item.location_id) || null : null,
          sentiment: item.sentiment,
          submittedAt: item.submitted_at,
          hasComment: Boolean(item.comments && item.comments.trim()),
        })),
      };
    });

    return jsonResponse({
      isAdmin: true,
      role: adminAuth.role,
      generatedAt: new Date().toISOString(),
      businesses: overview,
    });
  } catch (err) {
    console.error("admin-support-overview failed:", err);
    return jsonResponse({ error: "Could not load support overview" }, 500);
  }
});
