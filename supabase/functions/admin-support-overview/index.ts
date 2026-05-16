import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalAdmin } from "../_shared/admin-auth.ts";

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

type BusinessRow = {
  id: string;
  name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string | null;
  industry: string | null;
  business_type: string | null;
  timezone: string | null;
  email_alerts_enabled: boolean | null;
};

type LocationRow = {
  id: string;
  business_id: string | null;
  name: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type FeedbackRow = {
  id: string;
  business_id: string | null;
  location_id: string | null;
  sentiment: string | null;
  comments: string | null;
  submitted_at: string | null;
};

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

    const businesses = (businessesResult.data || []) as BusinessRow[];
    const locations = (locationsResult.data || []) as LocationRow[];
    const feedback = (feedbackResult.data || []) as FeedbackRow[];

    const locationsByBusiness = new Map<string, LocationRow[]>();
    const locationToBusiness = new Map<string, string>();
    for (const location of locations) {
      if (!location.business_id) continue;
      locationToBusiness.set(location.id, location.business_id);
      const current = locationsByBusiness.get(location.business_id) || [];
      current.push(location);
      locationsByBusiness.set(location.business_id, current);
    }

    const feedbackByBusiness = new Map<string, FeedbackRow[]>();
    const feedbackByLocation = new Map<string, FeedbackRow[]>();
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
