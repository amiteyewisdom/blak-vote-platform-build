import { getSupabaseAdminClient } from '@/lib/server-security'

export async function createClient() {
  return getSupabaseAdminClient()
}