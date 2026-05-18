import { getSupabaseAdminClient } from '@/lib/server-security'

export interface AuditLog {
  id?: string
  action: string
  severity: 'info' | 'warning' | 'critical'
  user_id?: string
  ip_address?: string
  details: Record<string, any>
  timestamp?: string
  resolved?: boolean
}

export interface SuspiciousActivity {
  pattern: string
  count: number
  threshold: number
  flagged: boolean
  details?: Record<string, any>
}

interface AuditSummaryRow {
  action: string
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }

  return String(error ?? '')
}

function isMissingColumn(error: unknown, column: string): boolean {
  return getErrorMessage(error).toLowerCase().includes(`could not find the '${column.toLowerCase()}' column`)
}

const SUSPICIOUS_PATTERNS = {
  RAPID_PAYMENT_FAILURES: { threshold: 5, window: 300 }, // 5 failures in 5 minutes
  DUPLICATE_PAYMENT_ATTEMPTS: { threshold: 3, window: 60 }, // 3 attempts in 1 minute
  INVALID_METADATA: { threshold: 10, window: 600 }, // 10 invalid attempts in 10 minutes
  RATE_LIMIT_EXCEEDED: { threshold: 20, window: 60 }, // 20 requests in 1 minute
  VOTING_AFTER_END: { threshold: 1, window: 300 }, // Any attempt after voting ends
}

type SuspiciousPatternKey = keyof typeof SUSPICIOUS_PATTERNS

function getPaymentFailurePattern(reason: string): SuspiciousPatternKey | null {
  const normalized = reason.toLowerCase()

  if (
    normalized.includes('invalid metadata') ||
    normalized.includes('metadata mismatch') ||
    normalized.includes('missing candidate or quantity')
  ) {
    return 'INVALID_METADATA'
  }

  if (
    normalized.includes('already in progress') ||
    normalized.includes('duplicate') ||
    normalized.includes('lock')
  ) {
    return 'DUPLICATE_PAYMENT_ATTEMPTS'
  }

  if (
    normalized.includes('payment not successful') ||
    normalized.includes('amount mismatch') ||
    normalized.includes('record not found')
  ) {
    return 'RAPID_PAYMENT_FAILURES'
  }

  return null
}

/**
 * Log a security audit event
 */
export async function logAudit(log: AuditLog): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const basePayload = {
    action: log.action,
    user_id: log.user_id,
    ip_address: log.ip_address,
    details: {
      ...log.details,
      severity: log.severity,
    },
  }

  try {
    let { error } = await supabase
      .from('audit_logs')
      .insert({
        ...basePayload,
        timestamp: log.timestamp || new Date().toISOString(),
      })

    if (error && isMissingColumn(error, 'timestamp')) {
      const retry = await supabase
        .from('audit_logs')
        .insert(basePayload)

      error = retry.error
    }

    if (error) {
      console.error('[AUDIT_LOG_ERROR]', error.message)
      return
    }

    // If critical, log to console as well
    if (log.severity === 'critical') {
      console.error('[AUDIT_CRITICAL]', {
        action: log.action,
        user_id: log.user_id,
        ip_address: log.ip_address,
        details: log.details,
      })
    }
  } catch (error) {
    console.error('[AUDIT_LOG_ERROR]', error)
  }
}

/**
 * Detect suspicious activity patterns
 */
export async function checkSuspiciousActivity(
  pattern: string,
  userId?: string,
  ipAddress?: string
): Promise<SuspiciousActivity | null> {
  if (!SUSPICIOUS_PATTERNS[pattern as keyof typeof SUSPICIOUS_PATTERNS]) {
    return null
  }

  const patternConfig = SUSPICIOUS_PATTERNS[pattern as keyof typeof SUSPICIOUS_PATTERNS]
  const since = new Date(Date.now() - patternConfig.window * 1000).toISOString()

  const supabase = getSupabaseAdminClient()

  const query = supabase
    .from('audit_logs')
    .select('id')
    .eq('action', pattern)
    .gte('created_at', since)

  if (userId) {
    query.eq('user_id', userId)
  } else if (ipAddress) {
    query.eq('ip_address', ipAddress)
  }

  const { data, error } = await query

  if (error) {
    console.error('[SUSPICIOUS_ACTIVITY_CHECK_ERROR]', error)
    return null
  }

  const count = data?.length || 0
  const flagged = count >= patternConfig.threshold

  const activity: SuspiciousActivity = {
    pattern,
    count,
    threshold: patternConfig.threshold,
    flagged,
  }

  if (flagged) {
    // Log this suspicious activity
    await logAudit({
      action: `SUSPICIOUS_PATTERN_DETECTED_${pattern}`,
      severity: 'critical',
      user_id: userId,
      ip_address: ipAddress,
      details: {
        pattern,
        count,
        threshold: patternConfig.threshold,
        window_seconds: patternConfig.window,
      },
    })

    activity.details = {
      window_seconds: patternConfig.window,
      recommendation: `Block ${userId ? 'user' : 'IP address'} temporarily`,
    }
  }

  return activity
}

/**
 * Get recent audit logs for monitoring
 */
export async function getRecentAuditLogs(
  filter?: { action?: string; severity?: string; userId?: string; ipAddress?: string },
  limit = 100
) {
  const supabase = getSupabaseAdminClient()

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (filter?.action) {
    query = query.eq('action', filter.action)
  }
  if (filter?.severity) {
    query = query.eq('severity', filter.severity)
  }
  if (filter?.userId) {
    query = query.eq('user_id', filter.userId)
  }
  if (filter?.ipAddress) {
    query = query.eq('ip_address', filter.ipAddress)
  }

  let { data, error } = await query

  if (error && isMissingColumn(error, 'timestamp')) {
    let fallbackQuery = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (filter?.action) {
      fallbackQuery = fallbackQuery.eq('action', filter.action)
    }
    if (filter?.severity) {
      fallbackQuery = fallbackQuery.contains('details', { severity: filter.severity })
    }
    if (filter?.userId) {
      fallbackQuery = fallbackQuery.eq('user_id', filter.userId)
    }
    if (filter?.ipAddress) {
      fallbackQuery = fallbackQuery.eq('ip_address', filter.ipAddress)
    }

    const fallbackResult = await fallbackQuery
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    console.error('[GET_AUDIT_LOGS_ERROR]', error)
    return []
  }

  return data || []
}

/**
 * Get suspicious activities summary
 */
export async function getSuspiciousActivitySummary() {
  const supabase = getSupabaseAdminClient()

  const since = new Date(Date.now() - 3600000).toISOString() // Last hour

  let { data, error } = await supabase
    .from('audit_logs')
    .select('action')
    .gte('timestamp', since)

  if (error && isMissingColumn(error, 'timestamp')) {
    const fallback = await supabase
      .from('audit_logs')
      .select('action')
      .gte('created_at', since)

    data = fallback.data
    error = fallback.error
  }

  if (error) {
    console.error('[SUSPICIOUS_ACTIVITY_SUMMARY_ERROR]', error)
    return {}
  }

  const summary: Record<string, number> = {}
  ;(data as AuditSummaryRow[] | null)?.forEach((log: AuditSummaryRow) => {
    summary[log.action] = (summary[log.action] || 0) + 1
  })

  return summary
}

/**
 * Helper function to log payment verification failures
 */
export async function logPaymentVerificationFailure(
  reference: string,
  reason: string,
  ipAddress?: string,
  userId?: string
) {
  await logAudit({
    action: 'PAYMENT_VERIFICATION_FAILED',
    severity: 'warning',
    user_id: userId,
    ip_address: ipAddress,
    details: {
      reference,
      reason,
    },
  })

  const pattern = getPaymentFailurePattern(reason)

  if (pattern) {
    await checkSuspiciousActivity(pattern, userId, ipAddress)
  }
}

/**
 * Helper function to log vote creation failures
 */
export async function logVoteCreationFailure(
  reason: string,
  eventId?: string,
  userId?: string,
  ipAddress?: string
) {
  const severity =
    reason.includes('Voting has ended') || reason.includes('Event') ? 'critical' : 'warning'

  await logAudit({
    action: 'VOTE_CREATION_FAILED',
    severity,
    user_id: userId,
    ip_address: ipAddress,
    details: {
      reason,
      eventId,
    },
  })

  if (reason.includes('Voting has ended')) {
    await checkSuspiciousActivity('VOTING_AFTER_END', userId, ipAddress)
  }
}

/**
 * Helper function to log rate limit violations
 */
export async function logRateLimitViolation(
  endpoint: string,
  ipAddress: string,
  attemptCount: number
) {
  await logAudit({
    action: 'RATE_LIMIT_EXCEEDED',
    severity: 'warning',
    ip_address: ipAddress,
    details: {
      endpoint,
      attemptCount,
    },
  })

  await checkSuspiciousActivity('RATE_LIMIT_EXCEEDED', undefined, ipAddress)
}
