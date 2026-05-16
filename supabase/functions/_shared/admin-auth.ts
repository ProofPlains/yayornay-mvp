import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

export type AdminAuthSuccess = {
  ok: true;
  isAdmin: true;
  role: string | null;
};

export type AdminAuthFailure = {
  ok: false;
  isAdmin: false;
  role: null;
  status: number;
  error: string;
};

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getAuthorizationHeader(req: Request): string | null {
  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization;
}

function createUserScopedSupabaseClient(authorization: string) {
  const key = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;

  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: authorization },
    },
  });
}

export async function requireInternalAdmin(req: Request): Promise<AdminAuthResult> {
  if (!SUPABASE_URL || (!SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY)) {
    return {
      ok: false,
      isAdmin: false,
      role: null,
      status: 500,
      error: "Supabase environment is not configured",
    };
  }

  const authorization = getAuthorizationHeader(req);

  if (!authorization) {
    return {
      ok: false,
      isAdmin: false,
      role: null,
      status: 401,
      error: "Missing bearer token",
    };
  }

  const supabase = createUserScopedSupabaseClient(authorization);

  const { data: isAdmin, error: isAdminError } = await supabase.rpc("is_internal_admin");

  if (isAdminError) {
    console.error("is_internal_admin RPC failed", isAdminError);

    return {
      ok: false,
      isAdmin: false,
      role: null,
      status: 500,
      error: "Unable to verify admin access",
    };
  }

  if (isAdmin !== true) {
    return {
      ok: false,
      isAdmin: false,
      role: null,
      status: 403,
      error: "Internal admin access required",
    };
  }

  const { data: role, error: roleError } = await supabase.rpc("current_internal_admin_role");

  if (roleError) {
    console.error("current_internal_admin_role RPC failed", roleError);

    return {
      ok: false,
      isAdmin: false,
      role: null,
      status: 500,
      error: "Unable to resolve admin role",
    };
  }

  return {
    ok: true,
    isAdmin: true,
    role: typeof role === "string" ? role : null,
  };
}
