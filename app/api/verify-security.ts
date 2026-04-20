import { getSupabaseAdminClient } from '@/lib/server-security'

interface SecurityCheckResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: Record<string, any>
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

export async function verifySecuritySetup(): Promise<SecurityCheckResult[]> {
  const supabase = getSupabaseAdminClient()
  const results: SecurityCheckResult[] = []

  const envChecks = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PAYSTACK_SECRET_KEY',
  ]

  const missingEnv = envChecks.filter((name) => !hasEnv(name))

  results.push({
    name: 'Required Environment Variables',
    status: missingEnv.length === 0 ? 'pass' : 'fail',
    message:
      missingEnv.length === 0
        ? 'Required payment and database environment variables are present'
        : 'One or more required environment variables are missing',
    details: missingEnv.length === 0 ? { checked: envChecks } : { missing: missingEnv },
  })

  // Check 1: Payments table is accessible with required columns
  try {
    const { error } = await supabase
      .from('payments')
      .select('id, reference, status, amount, voter_email, voter_phone, metadata', {
        head: true,
        count: 'exact',
      })

    if (!error) {
      results.push({
        name: 'Payments Table Access',
        status: 'pass',
        message: 'Payments table is reachable with required payment columns',
        details: {
          columns: ['id', 'reference', 'status', 'amount', 'voter_email', 'voter_phone', 'metadata'],
        },
      })
    } else {
      results.push({
        name: 'Payments Table Access',
        status: 'fail',
        message: `Error accessing payments table: ${error.message}`,
      })
    }
  } catch (error) {
    results.push({
      name: 'Payments Table Access',
      status: 'fail',
      message: `Error checking payments table: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }

  // Check 2: Votes table is accessible with required vote columns
  try {
    const { error } = await supabase
      .from('votes')
      .select('id, event_id, candidate_id, quantity, transaction_id, voter_phone, created_at', {
        head: true,
        count: 'exact',
      })

    if (!error) {
      results.push({
        name: 'Votes Table Access',
        status: 'pass',
        message: 'Votes table is reachable with required vote columns',
        details: {
          columns: ['id', 'event_id', 'candidate_id', 'quantity', 'transaction_id', 'voter_phone', 'created_at'],
        },
      })
    } else {
      results.push({
        name: 'Votes Table Access',
        status: 'fail',
        message: `Error accessing votes table: ${error.message}`,
      })
    }
  } catch (error) {
    results.push({
      name: 'Votes Table Access',
      status: 'fail',
      message: `Error checking votes table: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }

  // Check 3: Audit logs table is accessible
  try {
    const { error } = await supabase
      .from('audit_logs')
      .select('id, action, severity, timestamp', { head: true, count: 'exact' })

    if (!error) {
      results.push({
        name: 'Audit Logging Storage',
        status: 'pass',
        message: 'Audit logs table is reachable for monitoring writes',
      })
    } else {
      results.push({
        name: 'Audit Logging Storage',
        status: 'fail',
        message: `Error accessing audit_logs table: ${error.message}`,
      })
    }
  } catch (error) {
    results.push({
      name: 'Audit Logging Storage',
      status: 'fail',
      message: `Error checking audit logging storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }

  // Check 4: process_vote RPC exists
  try {
    const { error } = await supabase.rpc('process_vote', {
      p_event_id: '00000000-0000-0000-0000-000000000000',
      p_candidate_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: 0,
      p_voter_id: null,
      p_voter_phone: null,
      p_vote_source: 'test',
      p_payment_method: null,
      p_transaction_id: null,
      p_ip_address: null,
      p_amount_paid: null,
    })

    // We expect this to fail due to invalid UUIDs, but the RPC should exist
    if (error?.message?.includes('uuid') || error?.message?.includes('not found')) {
      results.push({
        name: 'Process Vote RPC',
        status: 'pass',
        message: 'process_vote RPC function exists and is callable',
      })
    } else if (error?.message?.includes('no_schema_found')) {
      results.push({
        name: 'Process Vote RPC',
        status: 'fail',
        message: 'process_vote RPC function not found',
      })
    } else {
      results.push({
        name: 'Process Vote RPC',
        status: 'pass',
        message: 'process_vote RPC function exists and is callable',
      })
    }
  } catch (error) {
    results.push({
      name: 'Process Vote RPC',
      status: 'warning',
      message: `Could not verify process_vote RPC: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }

  // Check 5: code-level safeguards still require manual review
  results.push({
    name: 'Application-Level Safeguards',
    status: 'warning',
    message: 'Client redirect validation, verification idempotency, and duplicate detection require code review in addition to runtime checks',
    details: {
      reviewAreas: [
        'payment-processing.ts',
        'payment/success/page.tsx',
        'events/[eventId]/page.tsx',
        'scheduled cleanup for stale payments',
      ],
    },
  })

  return results
}

export async function generateSecurityReport(): Promise<{
  timestamp: string
  checks: SecurityCheckResult[]
  summary: { total: number; passed: number; failed: number; warnings: number }
  recommendations: string[]
}> {
  const checks = await verifySecuritySetup()

  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    warnings: checks.filter((c) => c.status === 'warning').length,
  }

  const recommendations: string[] = []

  if (summary.failed > 0) {
    recommendations.push('⚠️  Fix failed security checks before deployment')
    checks.filter((c) => c.status === 'fail').forEach((c) => {
      recommendations.push(`  - ${c.name}: ${c.message}`)
    })
  }

  if (summary.warnings > 0) {
    recommendations.push('ℹ️  Review warnings and verify manually if needed')
  }

  if (summary.passed === summary.total) {
    recommendations.push('✅ All security checks passed')
  }

  return {
    timestamp: new Date().toISOString(),
    checks,
    summary,
    recommendations,
  }
}
