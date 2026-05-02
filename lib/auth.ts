import { createOptionalBrowserClient } from '@/lib/supabase/client-config'

export const supabase = createOptionalBrowserClient(
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)