import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

function isInvalidId(value: unknown): boolean {
  const normalized = String(value || '').trim()
  return !normalized || normalized === 'undefined' || normalized === 'null'
}

export async function GET(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const eventId = new URL(request.url).searchParams.get('eventId')
  if (isInvalidId(eventId)) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, String(eventId), auth.userId)
    if (ownershipError) return ownershipError
  }

  const [{ data: categories, error: categoriesError }, { data: eventData, error: eventError }] = await Promise.all([
    adminSupabase
      .from('categories')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('events')
      .select('id, image_url')
      .eq('id', eventId)
      .maybeSingle(),
  ])

  if (categoriesError || eventError) {
    return NextResponse.json({ error: categoriesError?.message || eventError?.message || 'Failed to load categories' }, { status: 500 })
  }

  return NextResponse.json({ categories: categories ?? [], eventImageUrl: eventData?.image_url || null })
}

export async function POST(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const eventId = String(body.eventId || '')
  const name = String(body.name || '').trim()
  const description = String(body.description || '').trim()

  if (isInvalidId(eventId) || !name) {
    return NextResponse.json({ error: 'eventId and name are required' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
    if (ownershipError) return ownershipError
  }

  const { data, error } = await adminSupabase
    .from('categories')
    .insert({
      event_id: eventId,
      name,
      description: description || null,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ category: data })
}

export async function PATCH(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const categoryId = String(body.id || '').trim()
  const name = String(body.name || '').trim()
  const description = String(body.description || '').trim()

  if (!categoryId || !name) {
    return NextResponse.json({ error: 'id and name are required' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data: category, error: categoryError } = await adminSupabase
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()

  if (categoryError || !category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, category.event_id, auth.userId)
    if (ownershipError) return ownershipError
  }

  const { data, error } = await adminSupabase
    .from('categories')
    .update({ name, description: description || null })
    .eq('id', categoryId)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ category: data })
}

export async function DELETE(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const categoryId = new URL(request.url).searchParams.get('id')
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data: category, error: categoryError } = await adminSupabase
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()

  if (categoryError || !category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, category.event_id, auth.userId)
    if (ownershipError) return ownershipError
  }

  const { error } = await adminSupabase.from('categories').delete().eq('id', categoryId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
