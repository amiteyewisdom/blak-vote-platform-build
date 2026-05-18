import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, type AccessTokenPayload, verifySessionToken } from "./lib/auth/session-token";
import { applySecurityHeaders } from "./lib/server-security";

function toLoginRedirect(req: NextRequest) {
  const loginUrl = new URL("/auth/login", req.url);
  loginUrl.searchParams.set("redirectTo", req.nextUrl.pathname);
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtectedRoute = pathname.startsWith("/admin") || pathname.startsWith("/organizer") || pathname.startsWith("/voter");
  const isMaintenancePage = pathname === "/maintenance";

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const adminSupabase = serviceRoleKey
    ? createClient(supabaseUrl || '', serviceRoleKey)
    : null;

  let maintenanceMode = false;
  const accessToken = req.cookies.get(ACCESS_COOKIE_NAME)?.value || null;
  const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value || null;
  const tokenPayload = accessToken ? await verifySessionToken<AccessTokenPayload>(accessToken) : null;
  const role = tokenPayload?.role ?? null;

  if (adminSupabase) {
    const { data: maintenanceSettings, error: maintenanceError } = await adminSupabase
      .from("platform_settings")
      .select("maintenance_mode")
      .limit(1)
      .maybeSingle();

    if (!maintenanceError) {
      maintenanceMode = maintenanceSettings?.maintenance_mode === true;
    }
  }

  if (maintenanceMode && role !== "admin" && !isMaintenancePage) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/maintenance", req.url)));
  }

  if (!maintenanceMode && isMaintenancePage) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/", req.url)));
  }

  if (!isProtectedRoute) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!tokenPayload && !refreshToken) {
    return toLoginRedirect(req);
  }

  if (pathname.startsWith("/admin") && role && role !== "admin") {
    return applySecurityHeaders(NextResponse.redirect(new URL(role === 'organizer' ? '/organizer' : '/voter', req.url)));
  }

  if (pathname.startsWith("/organizer") && role && role !== "organizer") {
    return applySecurityHeaders(NextResponse.redirect(new URL(role === 'admin' ? '/admin' : '/voter', req.url)));
  }

  if (pathname.startsWith("/voter") && role && role !== "voter") {
    return applySecurityHeaders(NextResponse.redirect(new URL(role === 'admin' ? '/admin' : '/organizer', req.url)));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};