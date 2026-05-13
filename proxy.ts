import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseBrowserConfig } from "./lib/supabase/client-config";

function toLoginRedirect(req: NextRequest) {
  const loginUrl = new URL("/auth/login", req.url);
  loginUrl.searchParams.set("redirectTo", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtectedRoute = pathname.startsWith("/admin") || pathname.startsWith("/organizer");
  const isMaintenancePage = pathname === "/maintenance";

  const config = getSupabaseBrowserConfig();

  if (!config) {
    if (isProtectedRoute) {
      return toLoginRedirect(req);
    }

    return NextResponse.next();
  }

  const { url: supabaseUrl, publishableKey: supabaseKey } = config;

  const res = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options) {
        res.cookies.set({ name, value, ...options });
      },
      remove(name: string, options) {
        res.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const adminSupabase = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

  let maintenanceMode = false;

  if (adminSupabase) {
    const { data: maintenanceSettings, error: maintenanceError } = await adminSupabase
      .from("platform_settings")
      .select("maintenance_mode")
      .limit(1)
      .maybeSingle();

    if (!maintenanceError) {
      maintenanceMode = maintenanceSettings?.maintenance_mode === true;
    }
  } else {
    const { data: maintenanceSettings } = await supabase
      .from("platform_settings")
      .select("maintenance_mode")
      .limit(1)
      .maybeSingle();

    maintenanceMode = maintenanceSettings?.maintenance_mode === true;
  }

  // Validate the authenticated user from the token instead of trusting cookie session presence alone.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  let role: string | null = null;

  if (!userError && user) {
    const { data: dbUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    role = dbUser?.role ?? null;
  }

  if (maintenanceMode && role !== "admin" && !isMaintenancePage) {
    return NextResponse.redirect(new URL("/maintenance", req.url));
  }

  if (!maintenanceMode && isMaintenancePage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!isProtectedRoute) {
    return res;
  }

  if (userError || !user) {
    return toLoginRedirect(req);
  }

  if (!role) {
    return toLoginRedirect(req);
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/organizer") && role !== "organizer") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};