import { NextResponse, NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const bulkVotePackageSchema = z.object({
  event_id: z.string().uuid(),
  votes_included: z.coerce.number().int().min(1).max(10000),
  price_per_package: z.coerce.number().nonnegative(),
  description: z.string().optional(),
})

const bulkVotePackageUpdateSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  votes_included: z.coerce.number().int().min(1).max(10000).optional(),
  price_per_package: z.coerce.number().nonnegative().optional(),
  description: z.string().optional().nullable(),
  is_active: z.coerce.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get('event_id')
    if (!eventId) {
      return NextResponse.json({ error: 'event_id required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const baseQuery = supabase
      .from('bulk_vote_packages')
      .select('*')
      .eq('event_id', eventId)
      .order('votes_included', { ascending: true })

    let packages: any[] | null = null
    let error: { message: string } | null = null

    const activeResult = await baseQuery.eq('is_active', true)
    packages = activeResult.data
    error = activeResult.error

    // Backward compatibility for environments where is_active column is absent.
    if (error && /is_active/i.test(error.message)) {
      const fallbackResult = await supabase
        .from('bulk_vote_packages')
        .select('*')
        .eq('event_id', eventId)
        .order('votes_included', { ascending: true })

      packages = fallbackResult.data
      error = fallbackResult.error
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ packages: packages ?? [] })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['admin', 'organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await req.json()
    const parseResult = bulkVotePackageSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
    }

    const { event_id, votes_included, price_per_package, description } = parseResult.data

    const supabase = getAdminClient()

    // Verify ownership if organizer
    if (auth.role === 'organizer') {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('organizer_id')
        .eq('id', event_id)
        .maybeSingle()

      if (eventError || !event || event.organizer_id !== auth.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { data: newPackage, error } = await supabase
      .from('bulk_vote_packages')
      .insert({
        event_id,
        votes_included,
        price_per_package,
        description: description || null,
      })
      .select('*')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ package: newPackage }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['admin', 'organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await req.json()
    const parseResult = bulkVotePackageUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
    }

    const { id, event_id, votes_included, price_per_package, description, is_active } = parseResult.data

    const supabase = getAdminClient()

    if (auth.role === 'organizer') {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('organizer_id')
        .eq('id', event_id)
        .maybeSingle()

      if (eventError || !event || event.organizer_id !== auth.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const updatePayload: Record<string, unknown> = {}
    if (votes_included !== undefined) updatePayload.votes_included = votes_included
    if (price_per_package !== undefined) updatePayload.price_per_package = price_per_package
    if (description !== undefined) updatePayload.description = description
    if (is_active !== undefined) updatePayload.is_active = is_active

    const { data: updatedPackage, error } = await supabase
      .from('bulk_vote_packages')
      .update(updatePayload)
      .eq('id', id)
      .eq('event_id', event_id)
      .select('*')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updatedPackage) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    return NextResponse.json({ package: updatedPackage })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['admin', 'organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const packageId = req.nextUrl.searchParams.get('id')
    const eventId = req.nextUrl.searchParams.get('event_id')

    if (!packageId && !eventId) {
      return NextResponse.json({ error: 'id or event_id required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    if (packageId) {
      // Single-package delete: verify ownership through the package's event.
      const { data: pkg, error: pkgError } = await supabase
        .from('bulk_vote_packages')
        .select('event_id')
        .eq('id', packageId)
        .maybeSingle()

      if (pkgError) {
        return NextResponse.json({ error: pkgError.message }, { status: 500 })
      }

      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }

      const pkgEventId = (pkg as any).event_id

      if (auth.role === 'organizer') {
        const { data: event, error: eventError } = await supabase
          .from('events')
          .select('organizer_id')
          .eq('id', pkgEventId)
          .maybeSingle()

        if (eventError || !event || event.organizer_id !== auth.userId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }

      const { error } = await supabase
        .from('bulk_vote_packages')
        .delete()
        .eq('id', packageId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Event-level delete (legacy behavior for edit page migration period)
    if (auth.role === 'organizer') {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('organizer_id')
        .eq('id', eventId)
        .maybeSingle()

      if (eventError || !event || event.organizer_id !== auth.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('bulk_vote_packages')
      .delete()
      .eq('event_id', eventId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
