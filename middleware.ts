import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect admin and organizer
  if (
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/organizer")
  ) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

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

  // 🔥 Use getSession instead of getUser
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/auth/sign-in", req.url));
  }

  // Fetch role from users table
  const { data: dbUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!dbUser?.role) {
    return NextResponse.redirect(new URL("/auth/sign-in", req.url));
  }

  // Role protection
  if (
  pathname.startsWith("/organizer") &&
  dbUser.role !== "organizer" &&
  dbUser.role !== "admin"
) {
  return NextResponse.redirect(new URL("/", req.url));
}

  if (pathname.startsWith("/organizer") && dbUser.role !== "organizer") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/organizer/:path*"],
};