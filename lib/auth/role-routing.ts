import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AppRole = 'admin' | 'organizer' | 'voter'

type RoleRow = {
  role: string | null
}

function normalizeRole(value: string | null | undefined): AppRole | null {
  if (value === 'admin' || value === 'organizer' || value === 'voter') {
    return value
  }

  return null
}

export function getRedirectPathForRole(role: AppRole | null): string {
  if (role === 'admin') {
    return '/admin'
  }

  if (role === 'organizer') {
    return '/organizer'
  }

  return '/vote'
}

export async function getAuthenticatedUserRole(
  supabase: SupabaseClient,
  user: User
): Promise<AppRole | null> {
  const { data: roleData, error: roleError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<RoleRow>()

  if (roleError) {
    throw new Error(roleError.message)
  }

  const dbRole = normalizeRole(roleData?.role)
  if (dbRole) {
    return dbRole
  }

  const metadataRoleValue = user.user_metadata?.role
  const metadataRole = typeof metadataRoleValue === 'string' ? metadataRoleValue : undefined

  return normalizeRole(metadataRole)
}
