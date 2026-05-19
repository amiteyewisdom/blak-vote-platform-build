import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { checkRateLimit, extractClientIp } from '@/lib/server-security';
import { isVotingOpenStatus } from '@/lib/event-status';
import { requireRole } from '@/lib/api-auth';

// Admin client used for role lookup, event validation, and process_vote RPC.
function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const bulkVoteSchema = z.object({
  votes: z
    .array(
      z.object({
        // nominee_id maps to p_candidate_id in process_vote.
        nominee_id: z.string().uuid(),
        event_id: z.string().uuid(),
        voter_id: z.string().uuid().optional(),
        // Manual endpoint must explicitly declare manual vote type.
        type: z.literal('manual'),
        // count is passed as p_quantity — how many votes this voter cast.
        count: z.number().int().min(1).max(5000),
        // method is retained for auditing but both values produce a manual vote.
        method: z.enum(['manual', 'bulk']),
        reason: z.string().trim().min(3).max(500).optional(),
        // category_id for manual vote categorization (optional)
        category_id: z.string().uuid().optional(),
        organizer_id: z.string().uuid().optional(),
      })
    )
    .min(1)
    .max(100),
});

async function reconcileNominationVoteCounts(
  supabase: ReturnType<typeof getAdminClient>,
  submittedVotes: Array<{ event_id: string; nominee_id: string }>
) {
  const eventCandidateMap = new Map<string, Set<string>>();

  for (const vote of submittedVotes) {
    const current = eventCandidateMap.get(vote.event_id) ?? new Set<string>();
    current.add(vote.nominee_id);
    eventCandidateMap.set(vote.event_id, current);
  }

  for (const [eventId, candidateSet] of eventCandidateMap.entries()) {
    const candidateIds = [...candidateSet];
    if (candidateIds.length === 0) continue;

    const { data: voteRows, error: voteRowsError } = await supabase
      .from('votes')
      .select('candidate_id, quantity')
      .eq('event_id', eventId)
      .in('candidate_id', candidateIds);

    if (voteRowsError) {
      throw new Error(voteRowsError.message);
    }

    const totalsByCandidate = new Map<string, number>();
    for (const row of voteRows ?? []) {
      const candidateId = String((row as any).candidate_id || '');
      if (!candidateId) continue;
      const quantity = Math.max(1, Number((row as any).quantity || 1));
      totalsByCandidate.set(candidateId, (totalsByCandidate.get(candidateId) ?? 0) + quantity);
    }

    for (const candidateId of candidateIds) {
      const { error: updateError } = await supabase
        .from('nominations')
        .update({ vote_count: totalsByCandidate.get(candidateId) ?? 0 })
        .eq('id', candidateId)
        .eq('event_id', eventId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const sessionClient = await createServerClient();
    const auth = await requireRole(sessionClient, ['admin', 'organizer']);
    if (!auth.ok) {
      return auth.response;
    }

    const supabase = getAdminClient();

    // Per-user rate limit: 30 bulk submissions per minute.
    const ipAddress = extractClientIp(req as unknown as Request);
    const rateKey = `bulk:user:${auth.userId}`;
    const limit = checkRateLimit(rateKey, 30, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
        }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parseResult = bulkVoteSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { votes } = parseResult.data;

    const eventIds = [...new Set(votes.map((vote) => vote.event_id))];
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, organizer_id, status')
      .in('id', eventIds);

    if (eventsError) {
      return NextResponse.json({ error: 'Database error', details: eventsError.message }, { status: 500 });
    }

    if (!events || events.length !== eventIds.length) {
      return NextResponse.json({ error: 'One or more events were not found' }, { status: 404 });
    }

    // All events must be accepting votes regardless of role.
    const closedEvents = events.filter(e => !isVotingOpenStatus(e.status));
    if (closedEvents.length > 0) {
      return NextResponse.json({ error: 'One or more events are not currently accepting votes' }, { status: 403 });
    }

    const eventOrganizerMap = new Map(events.map((event) => [event.id, event.organizer_id]));

    const candidateIds = [...new Set(votes.map((vote) => vote.nominee_id))];
    const { data: candidates, error: candidateError } = await supabase
      .from('nominations')
      .select('id, event_id, status, category_id')
      .in('id', candidateIds);

    if (candidateError) {
      return NextResponse.json({ error: 'Database error', details: candidateError.message }, { status: 500 });
    }

    const candidateMap = new Map((candidates ?? []).map((candidate) => [candidate.id, candidate]));
    const invalidVoteTarget = votes.find((vote) => {
      const candidate = candidateMap.get(vote.nominee_id);
      return !candidate || candidate.event_id !== vote.event_id || !['candidate', 'approved'].includes(candidate.status);
    });

    if (invalidVoteTarget) {
      return NextResponse.json({ error: 'One or more votes reference invalid event/candidate pairs' }, { status: 400 });
    }

    // Normalize category/reason from nominee metadata to avoid client-side drift.
    const normalizedVotes = votes.map((vote) => {
      const candidate = candidateMap.get(vote.nominee_id) as { category_id?: string | null } | undefined;
      const resolvedCategoryId = vote.category_id ?? candidate?.category_id ?? undefined;
      return {
        ...vote,
        category_id: resolvedCategoryId,
        reason: vote.reason && vote.reason.trim().length > 0 ? vote.reason : 'Manual organizer vote entry',
      };
    });

    const categoryIds = [...new Set(normalizedVotes.map((vote) => vote.category_id).filter(Boolean))] as string[];
    let categoryEventMap = new Map<string, string>();

    if (categoryIds.length > 0) {
      const { data: categories, error: categoryError } = await supabase
        .from('categories')
        .select('id, event_id')
        .in('id', categoryIds);

      if (categoryError) {
        return NextResponse.json({ error: 'Database error', details: categoryError.message }, { status: 500 });
      }

      categoryEventMap = new Map((categories ?? []).map((category) => [category.id, category.event_id]));

      // Only reject if the category is found in the DB AND belongs to a different event.
      // If the category UUID is not in the table (orphaned FK / deleted category), allow it through
      // — the nomination's own category_id is the authoritative reference.
      const invalidCategory = normalizedVotes.find((vote) => {
        if (!vote.category_id) return false;
        const catEventId = categoryEventMap.get(vote.category_id);
        return catEventId !== undefined && catEventId !== vote.event_id;
      });
      if (invalidCategory) {
        return NextResponse.json({ error: 'One or more votes reference categories outside the selected event' }, { status: 400 });
      }
    }

    const invalidNomineeCategory = normalizedVotes.find((vote) => {
      if (!vote.category_id) return false;
      const candidate = candidateMap.get(vote.nominee_id) as { category_id?: string | null } | undefined;
      if (!candidate) return true;
      if (!candidate.category_id) return false;
      return String(candidate.category_id || '') !== String(vote.category_id);
    });

    if (invalidNomineeCategory) {
      return NextResponse.json({ error: 'Selected nominee does not belong to the selected category' }, { status: 400 });
    }

    if (auth.role === 'organizer') {
      const hasForeignEvent = normalizedVotes.some((vote) => eventOrganizerMap.get(vote.event_id) !== auth.userId);
      if (hasForeignEvent) {
        return NextResponse.json({ error: 'Forbidden for one or more events' }, { status: 403 });
      }
    }

    // -------------------------------------------------------------------------
    // Submit each vote via the shared process_vote RPC so all votes (free, paid,
    // manual) land in the same `votes` table.
    //
    // vote_source = 'manual' and payment_method = 'manual' causes the DB trigger
    // to set:  vote_type = 'manual',  is_manual = true,  amount_paid = 0
    // This guarantees manual votes never affect revenue totals regardless of
    // what the caller passes for amount_paid.
    // -------------------------------------------------------------------------
    const failures: Array<{ index: number; voter_id: string | null; error: string }> = [];
    let successCount = 0;

    for (let i = 0; i < normalizedVotes.length; i++) {
      const v = normalizedVotes[i];
      const transactionId = crypto.randomUUID();

      // Persist manual-actor context keyed by transaction_id so the DB audit
      // trigger can attribute the inserted vote to the organizer/admin.
      // The insert is best-effort: if the column schema has not yet been updated
      // (e.g. migrations not fully applied) we fall back to the base columns so
      // the vote is never blocked by an audit-context insert failure.
      const { error: contextError } = await supabase
        .from('vote_manual_audit_context')
        .insert({
          transaction_id: transactionId,
          added_by_user_id: auth.userId,
          manual_entry_mode: v.method,
          reason: v.reason,
          category_id: v.category_id ?? null,
        });

      if (contextError) {
        // Try falling back to the base schema (pre-migration columns only)
        const { error: fallbackError } = await supabase
          .from('vote_manual_audit_context')
          .insert({
            transaction_id: transactionId,
            added_by_user_id: auth.userId,
            manual_entry_mode: v.method,
          });

        if (fallbackError) {
          // Audit context is supplementary — log but do not block the vote.
          console.warn(
            `[vote/bulk] audit context insert failed for tx ${transactionId}:`,
            fallbackError.message,
          );
        }
      }

      const { error: rpcError } = await supabase.rpc('process_vote', {
        p_event_id:       v.event_id,
        p_candidate_id:   v.nominee_id,
        p_quantity:       v.count,
        p_voter_id:       v.voter_id ?? auth.userId,
        p_voter_phone:    null,
        // Keep vote source locked to the explicit manual type in request.
        p_vote_source:    v.type,
        p_payment_method: 'manual',
        p_transaction_id: transactionId,
        p_ip_address:     ipAddress,
        // Explicit zero; the DB trigger will enforce this even if changed later.
        p_amount_paid:    0,
      });

      if (rpcError) {
        await supabase
          .from('vote_manual_audit_context')
          .delete()
          .eq('transaction_id', transactionId);

        failures.push({ index: i, voter_id: v.voter_id ?? null, error: rpcError.message });
      } else {
        successCount++;
      }
    }

    if (failures.length > 0 && successCount === 0) {
      const firstFailure = failures[0]?.error || null;
      return NextResponse.json(
        {
          error: 'All votes failed to record',
          details: firstFailure,
          failures,
        },
        { status: 400 },
      );
    }

    let reconciliationWarning: string | null = null;
    if (successCount > 0) {
      try {
        await reconcileNominationVoteCounts(supabase, normalizedVotes);
      } catch (error) {
        reconciliationWarning = error instanceof Error ? error.message : 'Failed to reconcile nomination totals.';
      }
    }

    if (failures.length > 0) {
      return NextResponse.json(
        {
          message: 'Some votes recorded with errors',
          successCount,
          failures,
          ...(reconciliationWarning ? { warning: reconciliationWarning } : {}),
        },
        { status: 207 },
      );
    }

    return NextResponse.json({
      message: 'Votes recorded successfully',
      successCount,
      ...(reconciliationWarning ? { warning: reconciliationWarning } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
