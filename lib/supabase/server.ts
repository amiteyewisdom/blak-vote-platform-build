import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseBrowserConfig, MISSING_SUPABASE_ENV_MESSAGE } from "@/lib/supabase/client-config"

export async function createClient() {
  const cookieStore = await cookies()
  const config = getSupabaseBrowserConfig()

  if (!config) {
    throw new Error(MISSING_SUPABASE_ENV_MESSAGE)
  }

  return createServerClient(
    config.url,
    config.publishableKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: "", ...options }) } catch {}
        },
      },
    }
  )
}